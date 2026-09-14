let currentStream = null;
let capturedPhotoBase64 = null;
let currentLocation = { latitude: null, longitude: null, lokasi: null };

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  loadAnggota();
  getLocation();
  checkAdminStatus();
  
  // Load Face-api models
  const modelsUrl = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights/';
  await Promise.all([
    faceapi.nets.faceRecognitionNet.loadFromUri(modelsUrl),
    faceapi.nets.faceLandmark68Net.loadFromUri(modelsUrl),
    faceapi.nets.faceDetectionNet.loadFromUri(modelsUrl),
    faceapi.nets.faceExpressionNet.loadFromUri(modelsUrl)
  ]);
  console.log('Face-api models loaded');
});

// Load Data Anggota
async function loadAnggota() {
  try {
    const response = await fetch('/api/anggota');
    const anggota = await response.json();
    
    const select = document.getElementById('namaSelect');
    anggota.forEach(person => {
      const option = document.createElement('option');
      option.value = person.nama;
      option.textContent = person.nama;
      select.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading anggota:', error);
  }
}

// Get Lokasi
function getLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        currentLocation.latitude = position.coords.latitude.toFixed(6);
        currentLocation.longitude = position.coords.longitude.toFixed(6);
        
        // Reverse geocoding using OpenStreetMap
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${currentLocation.latitude}&lon=${currentLocation.longitude}`)
          .then(response => response.json())
          .then(data => {
            currentLocation.lokasi = data.address?.city || data.address?.town || data.address?.village || `${currentLocation.latitude}, ${currentLocation.longitude}`;
            updateLocationDisplay();
          })
          .catch(() => {
            currentLocation.lokasi = `${currentLocation.latitude}, ${currentLocation.longitude}`;
            updateLocationDisplay();
          });
      },
      (error) => {
        console.warn('Geolocation error:', error);
        document.getElementById('locationText').textContent = 'Tidak dapat mengakses lokasi';
      }
    );
  }
}

function updateLocationDisplay() {
  document.getElementById('locationText').textContent = currentLocation.lokasi || 'Mengambil lokasi...';
  document.getElementById('latitudeText').textContent = currentLocation.latitude || '-';
  document.getElementById('longitudeText').textContent = currentLocation.longitude || '-';
}

// Start Camera
async function startCamera() {
  const nama = document.getElementById('namaSelect').value;
  
  // Validasi nama wajib diisi
  if (!nama || nama.trim() === '') {
    showMessage('⚠️ Anda harus memilih nama terlebih dahulu sebelum membuka kamera!', 'error');
    return;
  }

  try {
    currentStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    });
    
    const video = document.getElementById('videoCamera');
    video.srcObject = currentStream;
    
    showMessage('✅ Kamera berhasil dinyalakan', 'success');
  } catch (error) {
    showMessage('❌ Error mengakses kamera: ' + error.message, 'error');
    console.error('Camera error:', error);
  }
}

// Capture Photo
function capturePhoto() {
  const nama = document.getElementById('namaSelect').value;
  
  // Validasi nama wajib diisi
  if (!nama || nama.trim() === '') {
    showMessage('⚠️ Anda harus memilih nama terlebih dahulu sebelum mengambil foto!', 'error');
    return;
  }

  const video = document.getElementById('videoCamera');
  const canvas = document.getElementById('captureCanvas');
  
  if (!video.srcObject) {
    showMessage('⚠️ Nyalakan kamera terlebih dahulu', 'error');
    return;
  }

  const ctx = canvas.getContext('2d');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  
  ctx.drawImage(video, 0, 0);
  
  capturedPhotoBase64 = canvas.toDataURL('image/jpeg', 0.8);
  
  // Show preview
  const previewImg = document.getElementById('previewImage');
  previewImg.src = capturedPhotoBase64;
  document.getElementById('photoPreview').classList.remove('hidden');
  
  showMessage('✅ Foto berhasil diambil. Silakan periksa dan kirim.', 'success');
}

// Retake Photo
function retakePhoto() {
  document.getElementById('photoPreview').classList.add('hidden');
  capturedPhotoBase64 = null;
}

// Stop Camera
function stopCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
    document.getElementById('videoCamera').srcObject = null;
    showMessage('Kamera dimatikan', 'success');
  }
}

// Confirm and Send Absensi
async function confirmPhoto() {
  const nama = document.getElementById('namaSelect').value;
  
  // Validasi nama wajib diisi
  if (!nama || nama.trim() === '') {
    showMessage('⚠️ Anda harus memilih nama terlebih dahulu!', 'error');
    return;
  }
  
  if (!capturedPhotoBase64) {
    showMessage('⚠️ Ambil foto terlebih dahulu', 'error');
    return;
  }

  const button = event.target;
  button.disabled = true;
  button.textContent = 'Mengirim...';

  try {
    const response = await fetch('/api/absensi', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        nama: nama,
        foto: capturedPhotoBase64,
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        lokasi: currentLocation.lokasi
      })
    });

    const result = await response.json();

    if (response.ok) {
      showMessage(`✅ Absensi Berhasil!\n📅 Waktu: ${result.waktu}\n📍 Lokasi: ${result.lokasi}`, 'success');
      
      // Reset form
      setTimeout(() => {
        document.getElementById('namaSelect').value = '';
        document.getElementById('photoPreview').classList.add('hidden');
        capturedPhotoBase64 = null;
        stopCamera();
      }, 3000);
    } else {
      showMessage('❌ Error: ' + result.error, 'error');
    }
  } catch (error) {
    showMessage('❌ Gagal mengirim absensi: ' + error.message, 'error');
    console.error('Submit error:', error);
  } finally {
    button.disabled = false;
    button.textContent = 'Kirim Absensi';
  }
}

// Admin Functions
async function checkAdminStatus() {
  try {
    const response = await fetch('/api/check-admin');
    const data = await response.json();
    
    if (data.isAdmin) {
      showAdminDashboard();
      loadAbsensiData();
    }
  } catch (error) {
    console.error('Check admin error:', error);
  }
}

function openLoginModal() {
  document.getElementById('loginAdmin').classList.remove('hidden');
}

function closeLoginModal() {
  document.getElementById('loginAdmin').classList.add('hidden');
  document.getElementById('adminPassword').value = '';
}

async function loginAdmin() {
  const password = document.getElementById('adminPassword').value;
  
  if (!password) {
    showMessage('⚠️ Masukkan sandi terlebih dahulu', 'error');
    return;
  }

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password: password })
    });

    const result = await response.json();

    if (response.ok) {
      closeLoginModal();
      showAdminDashboard();
      loadAbsensiData();
      showMessage('✅ Login admin berhasil', 'success');
    } else {
      showMessage('❌ Sandi admin salah', 'error');
    }
  } catch (error) {
    showMessage('❌ Error login: ' + error.message, 'error');
  }
}

async function logoutAdmin() {
  try {
    await fetch('/api/logout', { method: 'POST' });
    
    document.getElementById('adminDashboard').classList.add('hidden');
    document.getElementById('siswaAbsensi').style.display = 'block';
    showMessage('✅ Logout berhasil', 'success');
  } catch (error) {
    console.error('Logout error:', error);
  }
}

function showAdminDashboard() {
  document.getElementById('siswaAbsensi').style.display = 'none';
  document.getElementById('adminDashboard').classList.remove('hidden');
}

async function loadAbsensiData() {
  try {
    const response = await fetch('/api/data-absensi');
    
    if (!response.ok) {
      showMessage('❌ Anda tidak memiliki akses admin', 'error');
      return;
    }

    const data = await response.json();
    displayAbsensiTable(data);
    loadStatistik();
  } catch (error) {
    console.error('Load data error:', error);
  }
}

function displayAbsensiTable(data) {
  const tbody = document.getElementById('bodyAbsensi');
  tbody.innerHTML = '';

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center;">Tidak ada data absensi</td></tr>';
    return;
  }

  data.forEach((item, index) => {
    const row = document.createElement('tr');
    const koordinat = item.latitude && item.longitude 
      ? `${item.latitude}, ${item.longitude}` 
      : '-';
    
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${item.nama}</td>
      <td>${item.tanggal}</td>
      <td>${item.jam}</td>
      <td>${item.menit}</td>
      <td>${item.detik}</td>
      <td>${item.lokasi || 'Tidak tersedia'}</td>
      <td>${koordinat}</td>
      <td><a onclick="viewFoto(${item.id})">Lihat Foto</a></td>
    `;
    tbody.appendChild(row);
  });
}

async function loadStatistik() {
  try {
    const response = await fetch('/api/statistik');
    const data = await response.json();
    
    const container = document.getElementById('statistikContainer');
    container.innerHTML = '';

    if (data.length === 0) {
      container.innerHTML = '<p>Belum ada data absensi</p>';
      return;
    }

    data.forEach(item => {
      const card = document.createElement('div');
      card.className = 'stat-card';
      card.innerHTML = `
        <div class="nama">${item.nama}</div>
        <div class="jumlah">${item.jumlah} kali</div>
      `;
      container.appendChild(card);
    });
  } catch (error) {
    console.error('Load statistik error:', error);
  }
}

function filterAbsensi() {
  const tanggal = document.getElementById('filterTanggal').value;
  const nama = document.getElementById('filterNama').value;

  if (!tanggal && !nama) {
    showMessage('⚠️ Masukkan tanggal atau nama untuk filter', 'error');
    return;
  }

  let url = '/api/data-absensi?';
  if (tanggal) url += `tanggal=${tanggal}&`;
  if (nama) url += `nama=${nama}&`;

  fetch(url)
    .then(response => response.json())
    .then(data => displayAbsensiTable(data))
    .catch(error => console.error('Filter error:', error));
}

function resetFilter() {
  document.getElementById('filterTanggal').value = '';
  document.getElementById('filterNama').value = '';
  loadAbsensiData();
  showMessage('✅ Filter direset', 'success');
}

function viewFoto(id) {
  window.open(`/api/foto-absensi/${id}`, '_blank');
}

function showMessage(text, type) {
  const messageDiv = document.getElementById('message');
  messageDiv.textContent = text;
  messageDiv.className = `message ${type}`;
  messageDiv.classList.remove('hidden');
  
  setTimeout(() => {
    messageDiv.classList.add('hidden');
  }, 4000);
}
