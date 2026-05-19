document.addEventListener("DOMContentLoaded", () => {
    const audio = document.getElementById('audio-player');
    const clickSound = document.getElementById('click-sound');
    const wheel = document.getElementById('wheel');

    let tracks = [];
    let currentView = 'menu'; // 'menu', 'list', 'import', 'playing'
    let currentIndex = 0;
    let currentActiveListId = 'menu-list';
    let db;
    
    // Estados novos do iPod
    let isShuffle = false;

    // Reduz o volume do som do clique para não estourar o ouvido
    clickSound.volume = 0.4;

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

    // Som de Clique customizado que funciona no iPhone
    function playClick() {
        clickSound.currentTime = 0;
        // O iOS exige que o áudio seja disparado imediatamente no touch
        clickSound.play().catch(() => {}); 
    }

    // --- 2. ROLAGEM E SELEÇÃO DE MENUS ---
    function updateMenuSelection() {
        const items = document.querySelectorAll(`#${currentActiveListId} li`);
        items.forEach((item, index) => {
            if (index === currentIndex) {
                item.classList.add('active');
                // Alinha automaticamente a tela para acompanhar o cursor subindo/descendo
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
                list.innerHTML += `<li class="${index === 0 ? 'active' : ''}" data-index="${index}">${track.name}</li>`;
            });
            currentActiveListId = 'dynamic-list';
            currentIndex = 0;
        }
        changeView('view-list', 'list');
    }

    // --- 3. REPRODUÇÃO AUTOMÁTICA E SHUFFLE ---
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

    // Evento de Fim de Música: Trata a Reprodução Automática
    audio.addEventListener('ended', () => {
        if (tracks.length === 0) return;

        if (isShuffle) {
            // Escolhe um índice aleatório diferente do atual
            let randomIndex = Math.floor(Math.random() * tracks.length);
            playTrack(randomIndex);
        } else {
            // Toca a próxima da fila sequencialmente
            let nextIndex = (currentIndex + 1) % tracks.length;
            playTrack(nextIndex);
        }
    });

    // --- 4. EXCLUIR MÚSICA DIRECTO NO PLAYER ---
    document.getElementById('btn-delete-song').addEventListener('touchstart', (e) => {
        e.preventDefault();
        playClick();
        if (tracks[currentIndex]) {
            const trackId = tracks[currentIndex].id;
            const transaction = db.transaction(["tracks"], "readwrite");
            const store = transaction.objectStore("tracks");
            store.delete(trackId);

            transaction.oncomplete = () => {
                alert("Música removida do aparelho!");
                loadSavedTracks();
                // Volta para o menu
                changeView('view-menu', 'menu');
                currentActiveListId = 'menu-list';
                currentIndex = 0;
                updateMenuSelection();
            };
        }
    });

    // --- 5. MAPEAMENTO DE TOQUES NA RODA ---
    wheel.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const targetId = e.target.id;
        
        // Toca o estalo personalizado em qualquer clique
        if (targetId) playClick();

        if (targetId === 'btn-menu') {
            if (currentView !== 'menu') {
                changeView('view-menu', 'menu');
                currentActiveListId = 'menu-list';
                currentIndex = 0;
                updateMenuSelection();
            }
        } 
        else if (targetId === 'btn-next') {
            if (currentView === 'menu' || currentView === 'list') {
                const items = document.querySelectorAll(`#${currentActiveListId} li`);
                if (items.length > 0) {
                    currentIndex = (currentIndex + 1) % items.length;
                    updateMenuSelection();
                }
            } else if (currentView === 'playing' && tracks.length > 1) {
                if (isShuffle) {
                    playTrack(Math.floor(Math.random() * tracks.length));
                } else {
                    playTrack((currentIndex + 1) % tracks.length);
                }
            }
        } 
        else if (targetId === 'btn-prev') {
            if (currentView === 'menu' || currentView === 'list') {
                const items = document.querySelectorAll(`#${currentActiveListId} li`);
                if (items.length > 0) {
                    currentIndex = (currentIndex - 1 + items.length) % items.length;
                    updateMenuSelection();
                }
            } else if (currentView === 'playing' && tracks.length > 1) {
                if (isShuffle) {
                    playTrack(Math.floor(Math.random() * tracks.length));
                } else {
                    playTrack((currentIndex - 1 + tracks.length) % tracks.length);
                }
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
                    if (target === 'import') {
                        changeView('view-import', 'import');
                    } else if (target === 'songs') {
                        renderSongsList();
                    } else if (target === 'shuffle-toggle') {
                        // Inverte o modo Shuffle
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
    }, { passive: false });

    // --- 6. SALVAMENTO DE ARQUIVOS ---
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

    // Atualização da barra azul
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

    // --- 7. SISTEMA DE BATERIA SIMULADA REALISTA PARA IPHONE ---
    let initialBattery = 88; 
    setInterval(() => {
        const now = new Date();
        document.getElementById('live-time').innerText = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
        
        // A cada poucos minutos altera de forma randômica simulada
        if (now.getMinutes() % 12 === 0 && now.getSeconds() === 0) {
            initialBattery = Math.max(5, initialBattery - 1);
        }
        document.getElementById('real-battery').innerText = `${initialBattery}% 🔋`;
    }, 1000);
});