document.addEventListener("DOMContentLoaded", () => {
    const audio = document.getElementById('audio-player');
    const wheel = document.getElementById('wheel');

    let tracks = [];
    let currentView = 'menu'; // 'menu', 'list', 'import', 'playing'
    let currentIndex = 0;
    let currentActiveListId = 'menu-list';
    let db;

    // Configura o volume inicial em 70%
    audio.volume = 0.7;

    // --- 1. CONFIGURAÇÃO DO BANCO DE DADOS LOCAL ---
    const request = indexedDB.open("iPodGlassStorage", 1);
    request.onupgradeneeded = (e) => {
        db = e.target.result;
        if (!db.objectStoreNames.contains("tracks")) {
            db.createObjectStore("tracks", { keyPath: "id", autoIncrement: true });
        }
    };
    request.onsuccess = (e) => {
        db = e.target.result;
        loadSavedTracks();
    };

    function loadSavedTracks() {
        const transaction = db.transaction(["tracks"], "readonly");
        const store = transaction.objectStore("tracks");
        const getAllRequest = store.getAll();
        getAllRequest.onsuccess = () => {
            tracks = getAllRequest.result;
            if (currentView === 'list') renderSongsList();
        };
    }

    // --- 2. CONTROLE DE GIRO (VOLUME VS MENU) ---
    let lastAngle = null;
    let accumulatedRotation = 0;
    let isMoving = false; 
    const sensitivityMenu = 20; // Sensibilidade para mudar de opção no menu
    const sensitivityVolume = 5; // Menor número = mais rápido para alterar o volume

    wheel.addEventListener('touchstart', (e) => {
        isMoving = false;
        lastAngle = null;
    }, { passive: true });

    wheel.addEventListener('touchmove', (e) => {
        e.preventDefault(); // Impede o Safari de arrastar a página
        
        const rect = wheel.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        const touchX = e.touches[0].clientX;
        const touchY = e.touches[0].clientY;
        
        // Calcula o ângulo do dedo em relação ao centro da roda
        const angle = Math.atan2(touchY - centerY, touchX - centerX);
        
        if (lastAngle !== null) {
            let delta = angle - lastAngle;
            if (delta > Math.PI) delta -= 2 * Math.PI;
            if (delta < -Math.PI) delta += 2 * Math.PI;
            
            const degrees = delta * (180 / Math.PI);
            if (Math.abs(degrees) > 1) isMoving = true; 
            
            accumulatedRotation += degrees;

            // MODO 1: Se estiver na tela tocando música, o giro controla o VOLUME
            if (currentView === 'playing') {
                if (Math.abs(accumulatedRotation) >= sensitivityVolume) {
                    if (accumulatedRotation > 0) {
                        // Girou sentido horário: Aumenta o volume (máximo 1.0)
                        audio.volume = Math.min(1, audio.volume + 0.05);
                    } else {
                        // Girou sentido anti-horário: Diminui o volume (mínimo 0.0)
                        audio.volume = Math.max(0, audio.volume - 0.05);
                    }
                    // Mostra o feedback visual do volume no status do player
                    document.getElementById('player-status').innerText = `🔊 Vol: ${Math.round(audio.volume * 100)}%`;
                    
                    // Reseta o texto do status após 1.5 segundos
                    clearTimeout(window.volumeTimeout);
                    window.volumeTimeout = setTimeout(() => {
                        document.getElementById('player-status').innerText = audio.paused ? 'Ⅱ Pausado' : '▶ Tocando';
                    }, 1500);

                    accumulatedRotation = 0;
                }
            } 
            // MODO 2: Se estiver nos menus, o giro move as OPÇÕES
            else if (currentView === 'menu' || currentView === 'list') {
                if (Math.abs(accumulatedRotation) >= sensitivityMenu) {
                    const items = document.querySelectorAll(`#${currentActiveListId} li`);
                    if (items.length > 0) {
                        if (accumulatedRotation > 0) {
                            currentIndex = (currentIndex + 1) % items.length;
                        } else {
                            currentIndex = (currentIndex - 1 + items.length) % items.length;
                        }
                        updateMenuSelection();
                    }
                    accumulatedRotation = 0;
                }
            }
        }
        lastAngle = angle;
    }, { passive: false });

    wheel.addEventListener('touchend', (e) => {
        lastAngle = null;
        if (isMoving) return; // Se o dedo deslizou girando, ignora o clique seco do botão

        const targetId = e.target.id;
        
        if (targetId === 'btn-menu') {
            if (currentView !== 'menu') {
                changeView('view-menu', 'menu');
                currentActiveListId = 'menu-list';
                currentIndex = 0;
                updateMenuSelection();
            }
        } 
        else if (targetId === 'btn-next') {
            if (currentView === 'playing' && tracks.length > 1) {
                currentIndex = (currentIndex + 1) % tracks.length;
                playTrack(currentIndex);
            }
        } 
        else if (targetId === 'btn-prev') {
            if (currentView === 'playing' && tracks.length > 1) {
                currentIndex = (currentIndex - 1 + tracks.length) % tracks.length;
                playTrack(currentIndex);
            }
        } 
        else if (targetId === 'btn-play') {
            if (!audio.src) return;
            if (audio.paused) {
                audio.play();
                document.getElementById('player-status').innerText = '▶ Tocando';
            } else {
                audio.pause();
                document.getElementById('player-status').innerText = 'Ⅱ Pausado';
            }
        } 
        else if (targetId === 'btn-center') {
            if (currentView === 'menu') {
                const activeItem = document.querySelector('#menu-list li.active');
                if (activeItem) {
                    const target = activeItem.getAttribute('data-target');
                    if (target === 'import') changeView('view-import', 'import');
                    else if (target === 'songs') renderSongsList();
                }
            } else if (currentView === 'list') {
                const activeSong = document.querySelector('#dynamic-list li.active');
                if (activeSong && tracks.length > 0) {
                    const songIndex = parseInt(activeSong.getAttribute('data-index'));
                    if (!isNaN(songIndex)) playTrack(songIndex);
                }
            }
        }
    });

    // --- 3. FUNÇÕES AUXILIARES DE INTERFACE ---
    function updateMenuSelection() {
        const items = document.querySelectorAll(`#${currentActiveListId} li`);
        items.forEach((item, index) => {
            item.classList.toggle('active', index === currentIndex);
        });
    }

    function changeView(viewId, viewMode) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        const targetView = document.getElementById(viewId);
        if (targetView) targetView.classList.add('active');
        currentView = viewMode;
    }

    function renderSongsList() {
        const list = document.getElementById('dynamic-list');
        list.innerHTML = '';
        if (tracks.length === 0) {
            list.innerHTML = '<li class="active">Nenhuma música importada</li>';
            currentActiveListId = 'dynamic-list';
            currentIndex = 0;
        } else {
            tracks.forEach((track, index) => {
                list.innerHTML += `<li class="${index === 0 ? 'active' : ''}" data-index="${index}">${track.name}</li>`;
            });
            currentActiveListId = 'dynamic-list';
            currentIndex = 0;
        }
        changeView('view-list', 'list');
    }

    function playTrack(index) {
        if (!tracks[index]) return;
        const track = tracks[index];
        const fileUrl = URL.createObjectURL(track.file);
        
        audio.src = fileUrl;
        audio.play().then(() => {
            document.getElementById('player-status').innerText = '▶ Tocando';
        });
        
        document.getElementById('now-playing-title').innerText = track.name;
        changeView('view-playing', 'playing');
    }

    document.getElementById('file-input').addEventListener('change', (e) => {
        const files = e.target.files;
        if (files.length > 0 && db) {
            const transaction = db.transaction(["tracks"], "readwrite");
            const store = transaction.objectStore("tracks");
            for (let i = 0; i < files.length; i++) {
                store.add({ name: files[i].name.replace('.mp3', ''), file: files[i] });
            }
            transaction.oncomplete = () => {
                loadSavedTracks();
                setTimeout(() => renderSongsList(), 100);
            };
        }
    });

    audio.addEventListener('timeupdate', () => {
        if (isNaN(audio.duration)) return;
        const progress = (audio.currentTime / audio.duration) * 100;
        document.getElementById('progress-fill').style.width = `${progress}%`;
        document.getElementById('time-current').innerText = formatTime(audio.currentTime);
        document.getElementById('time-total').innerText = formatTime(audio.duration);
    });

    function formatTime(secs) {
        const min = Math.floor(secs / 60);
        const sec = Math.floor(secs % 60);
        return `${min}:${sec < 10 ? '0' : ''}${sec}`;
    }

    setInterval(() => {
        const now = new Date();
        document.getElementById('live-time').innerText = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    }, 1000);

    if (navigator.getBattery) {
        navigator.getBattery().then(b => {
            const update = () => document.getElementById('real-battery').innerText = `${Math.round(b.level * 100)}% 🔋`;
            update(); b.addEventListener('levelchange', update);
        });
    }
});