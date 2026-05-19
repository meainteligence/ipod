document.addEventListener("DOMContentLoaded", () => {
    const audio = document.getElementById('audio-player');
    const clickSound = document.getElementById('click-sound');
    const wheel = document.getElementById('wheel');

    let tracks = [];
    let currentView = 'menu'; // 'menu', 'list', 'import', 'playing'
    let currentIndex = 0;
    let currentActiveListId = 'menu-list';
    let db;
    
    let isShuffle = false;
    audio.volume = 0.7;
    clickSound.volume = 0.4;

    // --- 1. BANCO DE DADOS LOCAL ---
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

    function playClick() {
        clickSound.currentTime = 0;
        clickSound.play().catch(() => {}); 
    }

    // --- 2. SINCRO VISUAL DA TELA ---
    function updateMenuSelection() {
        const items = document.querySelectorAll(`#${currentActiveListId} li`);
        items.forEach((item, index) => {
            if (index === currentIndex) {
                item.classList.add('active');
                item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else {
                item.classList.remove('active');
            }
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
                list.innerHTML += `<li class="${index === currentIndex ? 'active' : ''}" data-index="${index}">${track.name}</li>`;
            });
            currentActiveListId = 'dynamic-list';
        }
        changeView('view-list', 'list');
    }

    // --- 3. MOTOR DE ÁUDIO ---
    function playTrack(index) {
        if (!tracks[index]) return;
        currentIndex = index;
        const track = tracks[index];
        const fileUrl = URL.createObjectURL(track.file);
        
        audio.src = fileUrl;
        audio.play().then(() => {
            document.getElementById('player-status').innerText = '▶ Tocando';
        }).catch(() => {
            document.getElementById('player-status').innerText = '⚠ Toque Play';
        });
        
        document.getElementById('now-playing-title').innerText = track.name;
        document.getElementById('player-shuffle-badge').style.display = isShuffle ? 'inline-block' : 'none';
        changeView('view-playing', 'playing');
    }

    audio.addEventListener('ended', () => {
        if (tracks.length === 0) return;
        if (isShuffle) {
            playTrack(Math.floor(Math.random() * tracks.length));
        } else {
            playTrack((currentIndex + 1) % tracks.length);
        }
    });

    // Excluir música
    document.getElementById('btn-delete-song').addEventListener('touchstart', (e) => {
        e.preventDefault();
        playClick();
        if (tracks[currentIndex]) {
            const trackId = tracks[currentIndex].id;
            const transaction = db.transaction(["tracks"], "readwrite");
            const store = transaction.objectStore("tracks");
            store.delete(trackId);

            transaction.oncomplete = () => {
                loadSavedTracks();
                currentIndex = 0;
                setTimeout(() => renderSongsList(), 100);
            };
        }
    });

    // --- 4. ENGINE DE ROTAÇÃO PRECISA (TRAVA CLIQUES INDEVIDOS) ---
    let lastAngle = null;
    let accumulatedRotation = 0;
    let isMoving = false; 
    const sensitivityMenu = 15; // Menor número = mais rápida e ultra sensível a rotação
    const sensitivityVolume = 5;

    wheel.addEventListener('touchstart', (e) => {
        isMoving = false; // Começa assumindo que pode ser um clique comum
        lastAngle = null;
        accumulatedRotation = 0;
    }, { passive: true });

    wheel.addEventListener('touchmove', (e) => {
        e.preventDefault(); // Impede o iPhone de tremer a tela ou dar zoom
        
        const rect = wheel.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        const touchX = e.touches[0].clientX;
        const touchY = e.touches[0].clientY;
        
        // Descobre a posição matemática do dedo na bola
        const angle = Math.atan2(touchY - centerY, touchX - centerX);
        
        if (lastAngle !== null) {
            let delta = angle - lastAngle;
            if (delta > Math.PI) delta -= 2 * Math.PI;
            if (delta < -Math.PI) delta += 2 * Math.PI;
            
            const degrees = delta * (180 / Math.PI);
            
            // Se o dedo mover mais de 1 grau em curva, ativa o "Modo Giro" e BLOQUEIA os botões
            if (Math.abs(degrees) > 1) {
                isMoving = true; 
            }
            
            accumulatedRotation += degrees;

            // Se estiver na tela tocando a música, girar altera o Volume
            if (currentView === 'playing') {
                if (Math.abs(accumulatedRotation) >= sensitivityVolume) {
                    if (accumulatedRotation > 0) {
                        audio.volume = Math.min(1, audio.volume + 0.04);
                    } else {
                        audio.volume = Math.max(0, audio.volume - 0.04);
                    }
                    document.getElementById('player-status').innerText = `🔊 Vol: ${Math.round(audio.volume * 100)}%`;
                    
                    clearTimeout(window.volumeTimeout);
                    window.volumeTimeout = setTimeout(() => {
                        document.getElementById('player-status').innerText = audio.paused ? 'Ⅱ Pausado' : '▶ Tocando';
                    }, 1200);

                    accumulatedRotation = 0;
                }
            } 
            // Se estiver nas listas ou menus, girar ROLA AS OPÇÕES (Sem precisar clicar)
            else if (currentView === 'menu' || currentView === 'list') {
                if (Math.abs(accumulatedRotation) >= sensitivityMenu) {
                    const items = document.querySelectorAll(`#${currentActiveListId} li`);
                    if (items.length > 0) {
                        playClick(); // Faz o som clássico de estalo enquanto gira!
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
        
        // Se você estava deslizando o dedo em círculos, ignora totalmente o clique
        if (isMoving) return; 

        // Se o dedo foi apenas pressionado e solto no mesmo lugar, processa como clique físico
        const targetId = e.target.id;
        if (targetId) playClick(); 

        if (targetId === 'btn-menu') {
            if (currentView === 'playing') {
                currentActiveListId = 'dynamic-list';
                renderSongsList();
            } else if (currentView === 'list' || currentView === 'import') {
                changeView('view-menu', 'menu');
                currentActiveListId = 'menu-list';
                currentIndex = 0;
                updateMenuSelection();
            }
        } 
        
        else if (targetId === 'btn-next') {
            if (currentView === 'playing' && tracks.length > 1) {
                if (isShuffle) playTrack(Math.floor(Math.random() * tracks.length));
                else playTrack((currentIndex + 1) % tracks.length);
            }
        } 
        
        else if (targetId === 'btn-prev') {
            if (currentView === 'playing' && tracks.length > 1) {
                if (isShuffle) playTrack(Math.floor(Math.random() * tracks.length));
                else playTrack((currentIndex - 1 + tracks.length) % tracks.length);
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
                    else if (target === 'shuffle-toggle') {
                        isShuffle = !isShuffle;
                        document.getElementById('menu-shuffle-status').innerText = `Modo Aleatório: ${isShuffle ? 'ON 🔀' : 'OFF'}`;
                    }
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

    // --- 5. COMPLEMENTOS ---
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

    let initialBattery = 88; 
    setInterval(() => {
        const now = new Date();
        document.getElementById('live-time').innerText = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
        if (now.getMinutes() % 12 === 0 && now.getSeconds() === 0) {
            initialBattery = Math.max(5, initialBattery - 1);
        }
        document.getElementById('real-battery').innerText = `${initialBattery}% 🔋`;
    }, 1000);
});