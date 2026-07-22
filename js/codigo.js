var SUPABASE_URL = "https://cihpmglojwalaqcbnvlm.supabase.co"; // Tu URL (ej: "https://xxxx.supabase.co")
var SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpaHBtZ2xvandhbGFxY2JudmxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyNTA2MTUsImV4cCI6MjA5OTgyNjYxNX0.3-ELU-zqsTsmpPx4_1MRjpqtdtGEiYBIRiDGx626EjA"; // Tu Anon Public Key
var ADMIN_PASS = "gusgus1929"; // CONTRASEÑA PARA TUS COMANDOS GLOBALES

(function () {
  "use strict";

  // Cargar estado inicial
  var savedStatus = localStorage.getItem("blog_status");
  if (savedStatus) {
    var statusEl = document.getElementById("statusText");
    if (statusEl) { statusEl.textContent = savedStatus; }
    var timeEl = document.getElementById("statusTime");
    if (timeEl) { timeEl.textContent = "Actualizado: Recientemente"; }
  }

  /* ========================================================
     UTILIDAD: cuadro de diálogo estilo Win95
     ======================================================== */
  var modalOverlay = document.getElementById('modalOverlay');
  var modalTitle = document.getElementById('modalTitle');
  var modalBody = document.getElementById('modalBody');

  function showDialog(title, message) {
    modalTitle.textContent = title;
    modalBody.textContent = message;
    modalOverlay.classList.add('is-visible');
  }
  function hideDialog() { modalOverlay.classList.remove('is-visible'); }
  document.getElementById('modalOk').addEventListener('click', hideDialog);
  document.getElementById('modalCloseX').addEventListener('click', hideDialog);
  modalOverlay.addEventListener('click', function (e) { 
    if (e.target === modalOverlay && document.getElementById('modalCloseX').style.display !== 'none') {
      hideDialog(); 
    } 
  });


  /* ========================================================
     CONTROLES DE VENTANA: maximizar
     ======================================================== */

  document.getElementById('btnMaximize').addEventListener('click', function () {
    osWindow.classList.toggle('is-maximized');
    osWindow.classList.remove('is-dragging');
    osWindow.style.left = ''; osWindow.style.top = '';
  });


  /* ========================================================
     CONTADOR DE VISITAS — Funcional con Supabase
     ======================================================== */
  function animateOdometer(targetCount) {
    var digitSpans = document.querySelectorAll('#odometer span');
    if(!digitSpans.length) return;
    var current = 0;
    var steps = 24;
    var stepVal = Math.max(1, Math.floor(targetCount / steps));
    var counterTimer = setInterval(function () {
      current += stepVal + Math.floor(Math.random() * 3);
      if (current >= targetCount) { current = targetCount; clearInterval(counterTimer); }
      var str = String(current).padStart(digitSpans.length, '0');
      digitSpans.forEach(function (span, i) { span.textContent = str[i]; });
    }, 45);
  }

  function initVisitorCount() {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      animateOdometer(0);
      return;
    }
    
    // Obtener el contador actual
    fetch(SUPABASE_URL + '/rest/v1/mensajes?select=*&nombre=eq.SYS_VISITOR_COUNT&order=created_at.desc&limit=1', {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY
      }
    })
    .then(res => res.json())
    .then(data => {
      let count = 0;
      if (data && data.length > 0) {
         count = parseInt(data[0].mensaje, 10);
         if (isNaN(count)) count = 0;
      }
      
      // Verificar si es visita nueva
      let hasVisited = localStorage.getItem('blog_has_visited');
      if (!hasVisited && sessionStorage.getItem('blog_is_admin') !== "true") {
         // Si es admin no lo contamos para no inflar las stats mientras edita
         count += 1;
         localStorage.setItem('blog_has_visited', 'true');
         // Actualizar en base de datos guardando el nuevo número
         fetch(SUPABASE_URL + '/rest/v1/mensajes', {
            method: 'POST',
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': 'Bearer ' + SUPABASE_KEY,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ nombre: 'SYS_VISITOR_COUNT', mensaje: count.toString() })
         });
      }
      
      animateOdometer(count);
    })
    .catch(err => {
      console.error("Error con visitor count:", err);
      animateOdometer(0);
    });
  }
  
  // Ejecutar inicialización del contador
  initVisitorCount();

  /* ========================================================
     CHATBOX RETRO (SUPABASE)
     ======================================================== */
  function initChatbox() {
    var chatMessages = document.getElementById('chatMessages');
    var chatForm = document.getElementById('chatForm');
    var chatText = document.getElementById('chatText');

    if (!chatMessages || !chatForm || !SUPABASE_URL || !SUPABASE_KEY) {
      if (chatMessages) chatMessages.innerHTML = '<p style="color:red; text-align:center;">Base de datos desconectada.</p>';
      return;
    }

    function fetchChat() {
      // Fecha de hace 7 días en formato ISO
      var sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      var dateStr = sevenDaysAgo.toISOString();

      var url = SUPABASE_URL + '/rest/v1/mensajes?select=*&nombre=neq.SYS_VISITOR_COUNT&created_at=gte.' + dateStr + '&order=created_at.desc&limit=50';

      fetch(url, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY
        }
      })
      .then(res => res.json())
      .then(data => {
        chatMessages.innerHTML = '';
        if (!data || data.length === 0) {
          chatMessages.innerHTML = '<p style="color:#777; text-align:center; font-style:italic;">No hay mensajes en los últimos 7 días.</p>';
          return;
        }

        // Filtramos para respetar los comandos SYS_CLEAR
        var clearIndex = -1;
        for (var i = 0; i < data.length; i++) {
          if (data[i].nombre === 'SYS_CLEAR') { clearIndex = i; break; }
        }
        if (clearIndex !== -1) {
          // Si encontramos SYS_CLEAR, nos quedamos solo con los mensajes que están antes (más nuevos)
          data = data.slice(0, clearIndex);
        }

        // Ordenamos para que el más viejo (dentro de los 50) quede arriba
        data.reverse();

        // No mostrar los mensajes de sistema en el chat público
        var publicData = data.filter(function(row) { return !row.nombre.startsWith('SYS_') && row.mensaje !== 'SYS_USER_REGISTRATION'; });

        if (publicData.length === 0) {
          chatMessages.innerHTML = '<p style="color:#777; text-align:center; font-style:italic;">No hay mensajes en los últimos 7 días.</p>';
          return;
        }

        publicData.forEach(msg => {
          var dateObj = new Date(msg.created_at);
          var timeStr = dateObj.getHours().toString().padStart(2, '0') + ':' + dateObj.getMinutes().toString().padStart(2, '0');
          var name = msg.nombre || 'Anónimo';
          var text = msg.mensaje || '';
          
          // Escapar HTML para evitar XSS
          var escapeHTML = (str) => str.replace(/[&<>'"]/g, 
            tag => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
              }[tag])
          );

          var isAdmin = (name.toLowerCase() === 'lix' || name.toLowerCase() === 'admin');
          var nameClass = isAdmin ? 'chat-message-name admin' : 'chat-message-name';

          chatMessages.innerHTML += `
            <div class="chat-message">
              <span class="chat-message-time">[${timeStr}]</span>
              <span class="${nameClass}">${escapeHTML(name)}:</span> 
              <span>${escapeHTML(text)}</span>
            </div>
          `;
        });

        // Scroll al fondo
        chatMessages.scrollTop = chatMessages.scrollHeight;
      })
      .catch(err => {
        console.error("Error cargando chat:", err);
        chatMessages.innerHTML = '<p style="color:red; text-align:center;">Error de conexión.</p>';
      });
    }

    // Cargar inicial
    fetchChat();

    // Enviar mensaje
    chatForm.addEventListener('submit', function(e) {
      e.preventDefault();
      var nameVal = localStorage.getItem("blog_username") || "Visitante";
      var textVal = chatText.value.trim();

      if (!textVal) return;

      // === SISTEMA DE ADMINISTRACIÓN Y COMANDOS ===
      if (textVal.startsWith("/admin ")) {
        var pass = textVal.substring(7);
        if (pass === ADMIN_PASS) {
          sessionStorage.setItem("blog_is_admin", "true");
          showDialog("ADMIN.EXE", "Acceso de Administrador concedido. Ahora puedes usar comandos globales y /clear.");
        } else {
          showDialog("ERROR.EXE", "Contraseña incorrecta.");
        }
        chatText.value = '';
        return;
      }

      var cmdMap = {
        "/status ": "SYS_STATUS",
        "/viendo ": "SYS_VIENDO",
        "/leyendo ": "SYS_LEYENDO",
        "/escuchando ": "SYS_ESCUCHANDO",
        "/clear": "SYS_CLEAR"
      };

      var matchedCmd = Object.keys(cmdMap).find(c => textVal.startsWith(c));
      if (matchedCmd) {
        if (sessionStorage.getItem("blog_is_admin") !== "true") {
          showDialog("ERROR.EXE", "Acceso denegado. Usa /admin [clave] primero.");
          chatText.value = '';
          return;
        }
        
        var newText = matchedCmd === "/clear" ? "Cleared" : textVal.substring(matchedCmd.length);
        var sysName = cmdMap[matchedCmd];

        var btn = document.getElementById('chatSubmitBtn');
        btn.disabled = true;

        fetch(SUPABASE_URL + '/rest/v1/mensajes', {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ nombre: sysName, mensaje: newText })
        })
        .then(() => {
          chatText.value = '';
          if (typeof cargarEstadoSupabase === 'function' && sysName !== 'SYS_CLEAR') cargarEstadoSupabase();
          if (sysName === 'SYS_CLEAR') fetchChat();
          showDialog("UPDATE.EXE", "Comando ejecutado con éxito.");
        })
        .finally(() => { btn.disabled = false; });
        
        return;
      }

      // Bloquear botón temporalmente
      var btn = document.getElementById('chatSubmitBtn');
      btn.disabled = true;
      btn.textContent = '...';

      fetch(SUPABASE_URL + '/rest/v1/mensajes', {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ nombre: nameVal, mensaje: textVal })
      })
      .then(res => {
        if (!res.ok) throw new Error("Error posteando mensaje");
        chatText.value = ''; // Limpiar mensaje
        fetchChat(); // Recargar chat
      })
      .catch(err => {
        console.error("Error al enviar:", err);
        alert("No se pudo enviar el mensaje. Intenta de nuevo.");
      })
      .finally(() => {
        btn.disabled = false;
        btn.textContent = 'Enviar';
      });
    });
  }

  // Ejecutar inicialización del chat
  initChatbox();


  /* ========================================================
     BUSCADOR INTERACTIVO DIRECTO EN EL PANEL (ACTUALIZADO)
     ======================================================== */
  var searchForm = document.getElementById('searchForm');
  var searchInput = document.getElementById('searchInput');
  var searchResults = document.getElementById('searchResults');

  window.executeSearch = function executeSearch(term) {
    term = term.trim().toLowerCase();
    searchResults.innerHTML = ''; // Limpia resultados anteriores

    // Si no hay texto escrito, oculta el cuadro de resultados
    if (!term) {
      searchResults.style.display = 'none';
      return;
    }

    // Ahora busca también en .ensayo-card
    var searchable = document.querySelectorAll('.entry, .opinion, .ensayo-card');
    var matches = 0;

    searchable.forEach(function (el) {
      var title = el.getAttribute('data-title') || el.querySelector('.panel-header')?.textContent.trim() || '';
      var tags = el.getAttribute('data-tags') || '';
      var contentText = el.textContent.toLowerCase();

      // Busca en el título, en los tags o en el texto completo
      if (title.toLowerCase().indexOf(term) !== -1 || tags.toLowerCase().indexOf(term) !== -1 || contentText.indexOf(term) !== -1) {
        matches++;

        var li = document.createElement('li');
        li.style.padding = '4px 2px';
        li.style.borderBottom = '1px dotted #ccc';
        li.style.cursor = 'pointer';
        li.style.whiteSpace = 'nowrap';
        li.style.overflow = 'hidden';
        li.style.textOverflow = 'ellipsis';
        li.textContent = '📄 ' + title.replace('📄 ', '');

        // AL HACER CLIC EN UN RESULTADO:
        li.addEventListener('click', function () {
          if (el.classList.contains('ensayo-card')) {
            // 1. Activar pestaña Ensayos
            var navBtns = document.querySelectorAll('.nav-btn');
            if (navBtns.length > 2) navBtns[2].click();

            // 2. Abrir el ensayo
            var btnAbrir = el.querySelector('.btn-abrir-ensayo');
            if (btnAbrir) btnAbrir.click();
          } else {
            // 1. Forzar el click en el botón de Inicio
            var inicioBtn = document.querySelector('.nav-btn');
            if (inicioBtn) { inicioBtn.click(); }

            // 2. Hacer un scroll suave
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // 3. Destello visual
            el.style.backgroundColor = 'rgba(57, 255, 140, 0.3)';
            setTimeout(function () { el.style.backgroundColor = ''; }, 2000);
          }
        });

        searchResults.appendChild(li);
      }
    });

    // Mensaje de respaldo por si no encuentra nada
    if (matches === 0) {
      var li = document.createElement('li');
      li.style.padding = '4px 2px';
      li.style.color = '#888';
      li.style.fontStyle = 'italic';
      li.textContent = 'No se encontraron resultados';
      searchResults.appendChild(li);
    }

    // Muestra el cuadro blanco de resultados
    searchResults.style.display = 'block';
  }

  // Escucha cuando el usuario escribe (búsqueda instantánea)
  searchInput.addEventListener('input', function () {
    executeSearch(searchInput.value);
  });

  // Escucha cuando el usuario le da Enter o click al botón de la lupa
  searchForm.addEventListener('submit', function (e) {
    e.preventDefault();
    executeSearch(searchInput.value);
  });
  /* ========================================================
     WEB DECK PLAYER — Reproductor Real Funcional
     ======================================================== */
  var player = document.getElementById('webDeckPlayer');
  var playBtn = document.getElementById('playerPlay');
  var stopBtn = document.getElementById('playerStop');
  var nextBtn = document.getElementById('playerNext');
  var prevBtn = document.getElementById('playerPrev');
  var timeDisplay = document.getElementById('playerTime');
  var marquee = document.getElementById('playerMarquee');
  var volSlider = document.getElementById('playerVolume');

  // 1. Creamos el motor de audio en segundo plano
  var audio = new Audio();

  // 2. TU PLAYLIST: Puedes cambiar los nombres y los links .mp3 por los que quieras
  var playlist = [
    { title: "El Gran Tirano - Macha Y El Bloque Depresivo", url: "Media/Audio/Playlist Interfaz Principal/El Gran Tirano - Macha Y El Bloque Depresivo.mp3" },
    { title: "Lo Que No Fue No Será - Macha Y El Bloque Depresivo", url: "Media/Audio/Playlist Interfaz Principal/Lo Que No Fue No Será - Macha Y El Bloque Depresivo.mp3" },
    { title: "Mar y Cielo - Macha Y El Bloque Depresivo", url: "Media/Audio/Playlist Interfaz Principal/Mar y Cielo - Macha Y El Bloque Depresivo.mp3" },
    { title: "Mondo (Vuelve) - Macha Y El Bloque Depresivo, Alvaro Henriquez", url: "Media/Audio/Playlist Interfaz Principal/Mondo (Vuelve) - Macha Y El Bloque Depresivo, Alvaro Henriquez.mp3" }
  ];

  // 3. MEZCLADOR ALEATORIO (Shuffle)
  // Esto revuelve la lista de canciones cada vez que se carga la página
  for (var i = playlist.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var temp = playlist[i];
    playlist[i] = playlist[j];
    playlist[j] = temp;
  }

  var currentTrack = 0;
  var playerTimer = null;

  function loadTrack(index) {
    audio.src = playlist[index].url;
    marquee.textContent = "WEB_DECK_PLAYER.EXE ~ " + playlist[index].title + " ~ ";
    timeDisplay.textContent = "00:00";
  }

  function formatTime(s) {
    var m = Math.floor(s / 60), r = s % 60;
    return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
  }

  function playTrack() {
    // El navegador intentará reproducir. Si el usuario no ha interactuado con la página, el navegador lo bloqueará.
    audio.play().then(function () {
      playing = true;
      player.classList.add('is-playing');
      playBtn.textContent = '❚❚';
      clearInterval(playerTimer);
      playerTimer = setInterval(function () {
        timeDisplay.textContent = formatTime(Math.floor(audio.currentTime));
      }, 1000);
    }).catch(function (error) {
      console.log("Autoplay bloqueado: El usuario debe hacer clic en la página primero.");
    });
  }

  function pauseTrack() {
    audio.pause();
    player.classList.remove('is-playing');
    playBtn.textContent = '▶';
    clearInterval(playerTimer);
  }

  // === ESTO ES LO QUE FALTABA ===
  // Inicializar la primera canción al cargar y leer el volumen de la barra
  loadTrack(currentTrack);
  audio.volume = volSlider.value / 100;
  // ==============================

  // ========================================================
  // NUEVO SISTEMA DE REPRODUCCIÓN AUTOMÁTICA (AUTOPLAY INTELIGENTE)
  // ========================================================
  // Esperamos el primer clic del visitante en cualquier parte de la pantalla
  function iniciarMusicaFondo(e) {
    // Si el modal de registro está visible, no iniciamos la música todavía
    var modalOverlay = document.getElementById('modalOverlay');
    if (modalOverlay && modalOverlay.classList.contains('is-visible')) {
      return; 
    }

    // Si la música está pausada, la iniciamos
    if (audio.paused) {
      playTrack();
    }
    // Una vez que empieza a sonar, destruimos esta orden
    document.removeEventListener('click', iniciarMusicaFondo);
  }

  // Activar la trampa: escuchar clics en la página
  document.addEventListener('click', iniciarMusicaFondo);

  // Eventos de los botones de tu diseño
  var playing = false;
  playBtn.addEventListener('click', function () {
    if (audio.paused) { playTrack(); } else { pauseTrack(); }
  });

  stopBtn.addEventListener('click', function () {
    pauseTrack();
    audio.currentTime = 0;
    timeDisplay.textContent = '00:00';
  });

  nextBtn.addEventListener('click', function () {
    currentTrack = (currentTrack + 1) % playlist.length;
    loadTrack(currentTrack);
    playTrack();
  });

  prevBtn.addEventListener('click', function () {
    currentTrack = (currentTrack - 1 + playlist.length) % playlist.length;
    loadTrack(currentTrack);
    playTrack();
  });

  volSlider.addEventListener('input', function () {
    audio.volume = volSlider.value / 100;
  });

  /* ========================================================
     ESTADO GLOBAL SUPABASE
     ======================================================== */
  function cargarEstadoSupabase() {
    if (!SUPABASE_URL || !SUPABASE_KEY) return;
    // Buscamos los últimos 20 mensajes de sistema
    fetch(SUPABASE_URL + '/rest/v1/mensajes?select=*&nombre=like.SYS_*&order=created_at.desc&limit=20', {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY
      }
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          var foundStatus = false, foundViendo = false, foundLeyendo = false, foundEscuchando = false;
          // Al estar en orden DESC, el primero que encontremos de cada tipo es el más reciente
          data.forEach(row => {
            if (row.nombre === 'SYS_STATUS' && !foundStatus) {
              foundStatus = true;
              var statusEl = document.getElementById("statusText");
              var timeEl = document.getElementById("statusTime");
              if (statusEl) statusEl.textContent = row.mensaje;
              if (timeEl) {
                var d = new Date(row.created_at);
                timeEl.textContent = "Actualizado: " + d.toLocaleDateString() + " " + d.toLocaleTimeString();
              }
            }
            if (row.nombre === 'SYS_VIENDO' && !foundViendo) {
              foundViendo = true;
              var el = document.getElementById("val-viendo");
              if (el) el.textContent = row.mensaje;
            }
            if (row.nombre === 'SYS_LEYENDO' && !foundLeyendo) {
              foundLeyendo = true;
              var el = document.getElementById("val-leyendo");
              if (el) el.textContent = row.mensaje;
            }
            if (row.nombre === 'SYS_ESCUCHANDO' && !foundEscuchando) {
              foundEscuchando = true;
              var el = document.getElementById("val-escuchando");
              if (el) el.textContent = row.mensaje;
            }
          });
        }
      })
      .catch(err => console.error("Error cargando estado:", err));
  }

  // Activa el sondeo (polling) cada 5 segundos si Supabase está activo
  if (SUPABASE_URL && SUPABASE_KEY) {
    cargarEstadoSupabase();
    setInterval(() => {
      cargarEstadoSupabase();
    }, 5000);
  }

  /* ========================================================
     FORMULARIO DE CONTACTO — simulación en memoria
     ======================================================== */
  document.addEventListener('submit', function (e) {
    if (e.target && e.target.id === 'contactForm') {
      e.preventDefault();
      var name = document.getElementById('contactName').value.trim();
      showDialog("MENSAJE.EXE", "¡Gracias " + name + "! Tu mensaje ha sido simulado en memoria con éxito.");
      e.target.reset();
    }
  });




  /* ========================================================
     BOTONES DE NAVEGACIÓN INTERACTIVOS (CAMBIO DE CONTENIDO)
     ======================================================== */
  var navButtons = document.querySelectorAll('.nav-btn');
  var centerHeader = document.getElementById('colCenterHeader');

  navButtons.forEach(function (btn) {
    // Genera un identificador automático basado en el texto del botón, remueve acentos y normaliza a ASCII
      var rawText = btn.textContent.trim();
      var idTab = rawText.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remueve diacríticos (acentos)
        .replace(/ñ/g, "n")             // Reemplaza ñ por n para compatibilidad
        .replace(/[^a-z0-9\s-]/g, "")   // ELIMINA emojis y símbolos
        .trim()                         // Quita espacios extra que hayan quedado
        .replace(/\s+/g, '-');          // Reemplaza espacios por -

    btn.addEventListener('click', function () {
      // 1. Cambiar estado visual del botón seleccionado
      navButtons.forEach(function (b) { b.classList.remove('is-active'); });
      btn.classList.add('is-active');

      // 2. Ocultar todas las cajas y secciones de la columna central
      document.querySelectorAll('.tab-pane, .tab-section').forEach(function (el) {
        el.classList.remove('is-active');
      });

      // 3. Mostrar la caja y sección correspondientes
      var sectionToShow = document.getElementById('hueco-' + idTab);
      if (sectionToShow) {
        sectionToShow.classList.add('is-active');
      }
      var paneToShow = document.getElementById('tab-' + idTab);
      if (paneToShow) {
        paneToShow.classList.add('is-active');
      }

      // 4. Cambiar el título superior gris de la columna central con el nombre del botón
      if (centerHeader) {
        centerHeader.textContent = btn.textContent.trim();
        
        // Si el click vino desde el altar (cuyo botón está oculto), scrollear hacia arriba
        if (idTab.startsWith('altar-')) {
          centerHeader.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    });
  });

  /* ========================================================
     RESIZE OBSERVER: Ajuste del altar responsivo
     ======================================================== */
  var espacioCollage = document.querySelector('.espacio-collage');
  var canvasEspacial = document.querySelector('.canvas-espacial');
  if (espacioCollage && canvasEspacial) {
    var resizeObserver = new ResizeObserver(function(entries) {
      for (let entry of entries) {
        var newWidth = entry.contentRect.width;
        var scale = newWidth / 730;
        canvasEspacial.style.transform = 'scale(' + scale + ')';
      }
    });
    resizeObserver.observe(espacioCollage);
  }

})();

/* ========================================================
     FUNCIONALIDAD: Filtro dinámico del Archivo de Ensayos
     ======================================================== */
var archiveLinks = document.querySelectorAll('.archive-block__index a');
var archiveItems = document.querySelectorAll('.scrolllist__item');

archiveLinks.forEach(function (link) {
  link.addEventListener('click', function (e) {
    e.preventDefault();
    var targetFilter = link.getAttribute('data-month');

    archiveItems.forEach(function (item) {
      if (targetFilter === 'all') {
        item.style.display = ''; // Muestra todos
      } else {
        // Si el texto del ensayo contiene la cadena numérica (ej: "10/2023"), se mantiene visible
        if (item.textContent.indexOf(targetFilter) !== -1) {
          item.style.display = '';
        } else {
          item.style.display = 'none'; // Oculta el resto
        }
      }
    });
  });
});




/* ========================================================
     SISTEMA DE BIENVENIDA / REGISTRO ÚNICO DE USUARIO
     ======================================================== */
// ========================================================
// SISTEMA DE BIENVENIDA / REGISTRO ÚNICO DE USUARIO
// ========================================================
(function() {
  var guardadoUser = localStorage.getItem("blog_username");

  if (!guardadoUser) {
    var modalTitle = document.getElementById('modalTitle');
    var modalBody = document.getElementById('modalBody');
    var modalOk = document.getElementById('modalOk');
    var modalOverlay = document.getElementById('modalOverlay');
    var modalCloseX = document.getElementById('modalCloseX');

    modalTitle.textContent = "LOGIN.EXE - Acceso al Chat";
    modalBody.innerHTML = `
        <p style="margin-bottom: 10px;">¡Bienvenido a la bitácora! Ingresa un apodo y una contraseña (PIN) para participar:</p>
        <input type="text" id="newBlogUser" class="bevel-in-thin" placeholder="Tu apodo aquí..." 
               style="width: 100%; padding: 5px; margin-bottom: 8px; font-family: var(--font-ui); background: #fff; color: #000; border: none;">
        <input type="password" id="newBlogPass" class="bevel-in-thin" placeholder="Contraseña (PIN)..." 
               style="width: 100%; padding: 5px; margin-bottom: 5px; font-family: var(--font-ui); background: #fff; color: #000; border: none;">
        <p style="font-size: 10px; color: #777; margin-bottom: 15px; line-height: 1.2;">
           *Nota: Este PIN se guarda de forma básica. ¡Por favor NO uses tu contraseña real de bancos o redes sociales!
        </p>
        <div style="display: flex; gap: 10px;">
           <button class="bevel-out" id="btnRegister" style="flex: 1; padding: 5px; font-family: var(--font-ui);">Crear Cuenta Nueva</button>
           <button class="bevel-out" id="btnLogin" style="flex: 1; padding: 5px; font-family: var(--font-ui);">Iniciar Sesión</button>
        </div>
        <div style="margin-top: 10px; text-align: center;">
           <button class="bevel-out" id="btnGuest" style="width: 100%; padding: 5px; font-family: var(--font-ui);">Entrar como Invitado</button>
        </div>
      `;

    modalOverlay.classList.add('is-visible');
    
    // Ocultar botón X momentáneamente para forzar registro (opcional, pero buena idea)
    if(modalCloseX) modalCloseX.style.display = 'none';

    // Para evitar que el eventListener genérico cierre el modal, clonamos el botón OK
    var newModalOk = modalOk.cloneNode(true);
    modalOk.parentNode.replaceChild(newModalOk, modalOk);
    newModalOk.style.display = 'none'; // Ocultamos el botón "Aceptar" genérico

    var btnRegister = document.getElementById('btnRegister');
    var btnLogin = document.getElementById('btnLogin');
    var btnGuest = document.getElementById('btnGuest');

    function handleAuth(isLogin) {
      var inputUser = document.getElementById('newBlogUser').value.trim();
      var inputPass = document.getElementById('newBlogPass').value.trim();
      
      if (inputUser.length < 3) {
        alert("El nombre de usuario debe tener al menos 3 caracteres.");
        return;
      }
      
      if (!SUPABASE_URL || !SUPABASE_KEY) {
         finishRegistration(inputUser);
         return;
      }
      
      var targetBtn = isLogin ? btnLogin : btnRegister;
      var otherBtn = isLogin ? btnRegister : btnLogin;
      targetBtn.textContent = 'Verificando...';
      targetBtn.disabled = true;
      otherBtn.disabled = true;
      btnGuest.disabled = true;

      fetch(SUPABASE_URL + '/rest/v1/mensajes?select=*&nombre=ilike.' + encodeURIComponent(inputUser), {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY
        }
      })
      .then(res => res.json())
      .then(data => {
        var isExisting = (data && data.length > 0);
        
        if (isLogin) {
          if (isExisting) {
            var regRow = data.find(m => m.mensaje.startsWith('SYS_USER_REGISTRATION'));
            if (regRow) {
              var savedPass = regRow.mensaje.split(':')[1] || '';
              if (savedPass === inputPass && inputPass !== '') {
                finishRegistration(inputUser); // OK
              } else {
                alert("Contraseña incorrecta.");
              }
            } else {
              alert("Este usuario existe pero no tiene contraseña registrada.");
            }
          } else {
            alert("El usuario '" + inputUser + "' no existe. Crea una cuenta nueva.");
          }
          targetBtn.textContent = 'Iniciar Sesión';
        } else {
          // Register
          if (isExisting) {
            alert("Este nombre de usuario ya está en uso. Por favor, elige otro.");
            targetBtn.textContent = 'Crear Cuenta Nueva';
          } else {
            var msgRegistro = 'SYS_USER_REGISTRATION' + (inputPass ? ':' + inputPass : '');
            fetch(SUPABASE_URL + '/rest/v1/mensajes', {
              method: 'POST',
              headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': 'Bearer ' + SUPABASE_KEY,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ nombre: inputUser, mensaje: msgRegistro })
            }).then(() => finishRegistration(inputUser))
              .catch(() => finishRegistration(inputUser));
            return; // Evita re-habilitar los botones inmediatamente si fue exitoso
          }
        }
        
        targetBtn.disabled = false;
        otherBtn.disabled = false;
        btnGuest.disabled = false;
      })
      .catch(err => {
        console.error("Error verificando usuario", err);
        finishRegistration(inputUser);
      });
    }

    btnRegister.addEventListener('click', function(e) { handleAuth(false); });
    btnLogin.addEventListener('click', function(e) { handleAuth(true); });
    
    btnGuest.addEventListener('click', function(e) {
      var guestName = "Invitado_" + Math.floor(Math.random() * 10000);
      finishRegistration(guestName);
    });

    function finishRegistration(inputUser) {
        localStorage.setItem("blog_username", inputUser);
        modalOverlay.classList.remove('is-visible');
        modalBody.textContent = "";
        if(modalCloseX) modalCloseX.style.display = ''; // restaurar
        alert("Autenticado como '" + inputUser + "'. ¡Disfruta del blog!");
        
        // Iniciar la música automáticamente al entrar al blog (si estaba pausada)
        if (typeof playTrack === 'function' && audio.paused) {
           playTrack();
        }

        // Restaurar evento genérico de cerrar y mostrar botón Aceptar
        newModalOk.style.display = '';
        newModalOk.addEventListener('click', function() { modalOverlay.classList.remove('is-visible'); });
        newModalOk.textContent = 'Aceptar';
        newModalOk.disabled = false;
    }
  }
})();



/* ========================================================
   SISTEMA UNIVERSAL MARKDOWN
   ======================================================== */
function initSeccionMarkdown(baseId, jsonPath, folderPath) {
  const listaContainer = document.getElementById(baseId + '-container');
  const viewLista = document.getElementById(baseId + '-lista');
  const viewLector = document.getElementById(baseId + '-lector');
  const lectorContenido = document.getElementById(baseId + '-lector-contenido');
  const lectorTitulo = document.getElementById(baseId + '-lector-titulo');
  const btnVolver = document.getElementById('btn-volver-' + baseId);

  if (!btnVolver) return;

  // Volver a la lista
  btnVolver.addEventListener('click', function () {
    viewLista.style.display = 'block';
    viewLector.style.display = 'none';
  });

  if (!listaContainer) return;

  fetch(jsonPath)
    .then(res => res.json())
    .then(entradas => {
      listaContainer.innerHTML = '';

      if (entradas.length === 0) {
        listaContainer.innerHTML = `
          <div class="panel bevel-out panel-fill" style="margin-bottom: 15px;">
            <div class="panel-header dark">Carpeta Vacía</div>
            <div class="panel-body dark">
              <p style="color: var(--crt-green); font-style: italic; margin: 0;">Aún no hay publicaciones en esta sección.</p>
            </div>
          </div>
        `;
        return;
      }

      entradas.forEach(entrada => {
        const div = document.createElement('div');
        div.className = 'panel bevel-out ensayo-card';
        div.style.marginBottom = '15px';
        div.setAttribute('data-tags', (entrada.hashtags || []).join(' '));

        // Convertimos los hashtags en botones clickeables
        const hashtagsHtml = (entrada.hashtags || []).map(tag =>
          `<span class="hashtag-btn" style="cursor: url('Media/Img/imperdible-abierto-48.png') 31 8, pointer; text-decoration: underline;" data-tag="${tag}">${tag}</span>`
        ).join(' ');

        div.innerHTML = `
          <div class="panel-header dark" style="background: #00003c; color: #fff; font-size: 13px;">
            📄 ${entrada.titulo || 'Sin Título'}
          </div>
          <div class="panel-body dark">
            <p style="font-size: 11px; color: #39ff8c; margin: 0 0 8px 0; font-weight: bold;">
              ${hashtagsHtml} | <span style="pointer-events: none;">Fecha: ${entrada.fecha || ''}</span>
            </p>
            <p style="line-height: 1.5; color: #fff; margin-bottom: 15px; font-size: 12.5px; pointer-events: none;">
              ${entrada.resumen || ''}
            </p>
            <div style="text-align: right;">
              <button class="btn-abrir-ensayo bevel-out" style="padding: 4px 12px; font-family: var(--font-ui); font-size: 12px; color: #000; cursor: url('Media/Img/imperdible-abierto-48.png') 31 8, pointer;">Leer Publicación</button>
            </div>
          </div>
        `;

        const btnAbrir = div.querySelector('.btn-abrir-ensayo');
        btnAbrir.addEventListener('click', function () {
          viewLista.style.display = 'none';
          viewLector.style.display = 'block';
          if (lectorTitulo) lectorTitulo.textContent = `📄 ${entrada.titulo || 'Sin Título'}`;
          lectorContenido.innerHTML = '<p style="color: var(--crt-green);">Cargando archivo de texto...</p>';

          fetch(folderPath + entrada.archivo)
            .then(res => res.text())
            .then(md => {
              lectorContenido.innerHTML = marked.parse(md);

              // 1. (Eliminado: tags en cabecera por ser redundantes con la vista de tarjeta)

              // 2. Convertir los hashtags escritos DENTRO del texto (Markdown) en botones interactivos
              function linkifyHashtags(node) {
                 if (node.nodeType === 3) { // Nodo de texto puro
                    const regex = /(^|\s)(#[a-zA-ZáéíóúñÁÉÍÓÚÑ0-9_]+)/g;
                    if (regex.test(node.nodeValue)) {
                       const span = document.createElement('span');
                       span.innerHTML = node.nodeValue.replace(regex, `$1<span class="hashtag-btn" data-tag="$2" style="cursor: url('Media/Img/imperdible-abierto-48.png') 31 8, pointer; text-decoration: underline; color: #39ff8c; font-weight: bold;">$2</span>`);
                       node.parentNode.replaceChild(span, node);
                    }
                 } else if (node.nodeType === 1 && node.nodeName !== 'A' && node.nodeName !== 'CODE') {
                    // Si es un elemento HTML, exploramos sus hijos (ignorando enlaces y código)
                    Array.from(node.childNodes).forEach(linkifyHashtags);
                 }
              }
              linkifyHashtags(lectorContenido);

              // 3. Darles vida a todos los hashtags encontrados (los de arriba y los del texto)
              lectorContenido.querySelectorAll('.hashtag-btn').forEach(btn => {
                btn.addEventListener('click', function(e) {
                   e.stopPropagation();
                   var tag = this.getAttribute('data-tag');
                   var searchInput = document.getElementById('searchInput');
                   if (searchInput && window.executeSearch) {
                     searchInput.value = tag;
                     window.executeSearch(tag);
                     searchInput.focus();
                     
                     // Hacer scroll hacia el buscador para que el usuario vea qué pasó
                     var searchPanel = searchInput.closest('.panel');
                     if (searchPanel) {
                       searchPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                     }
                     
                     // Destello visual en el buscador
                     searchInput.classList.remove('flash-search-active');
                     void searchInput.offsetWidth; // reset anim
                     searchInput.classList.add('flash-search-active');
                   }
                });
              });
            })
            .catch(err => {
              lectorContenido.innerHTML = '<p style="color: red;">Error al cargar el archivo.</p>';
            });
        });

        // Evento para los hashtags
        div.querySelectorAll('.hashtag-btn').forEach(btn => {
          btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var searchInput = document.getElementById('searchInput');
            searchInput.value = this.getAttribute('data-tag');
            window.executeSearch(this.getAttribute('data-tag'));

            // Efecto visual para llamar la atención
            searchInput.focus();
            var searchPanel = searchInput.closest('.panel');
            if (searchPanel) {
              searchPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }

            searchInput.classList.remove('flash-search-active');
            // Trigger reflow para reiniciar la animación
            void searchInput.offsetWidth;
            searchInput.classList.add('flash-search-active');
          });
        });

        listaContainer.appendChild(div);
      });
    })
    .catch(err => {
      listaContainer.innerHTML = '<p style="color: red;">No se pudo cargar el índice de la sección.</p>';
    });

  if (btnVolver) {
    btnVolver.addEventListener('click', function () {
      viewLector.style.display = 'none';
      viewLista.style.display = 'block';
    });
  }
}


//inicio
fetch('componentes/menu-izquierdo/1-inicio.html')
  .then(res => res.text())
  .then(data => {
    document.getElementById('hueco-inicio').innerHTML = data;
    if (typeof initInicioTab === 'function') {
       initInicioTab();
    }
  });

//sobre mi
fetch('componentes/menu-izquierdo/2-sobre-mi.html')
  .then(res => res.text())
  .then(data => {
    document.getElementById('hueco-sobre-mi').innerHTML = data;
    // Cargar contenido Markdown dinámico
    fetch('Media/SobreMi/sobre-mi.md')
      .then(res => res.text())
      .then(mdText => {
         var contentDiv = document.getElementById('sobre-mi-content');
         if (contentDiv && window.marked) {
            contentDiv.innerHTML = marked.parse(mdText);
         }
      })
      .catch(err => {
         console.error("Error cargando perfil", err);
      });
  });

//ensayos
fetch('componentes/menu-izquierdo/3-ensayos.html')
  .then(res => res.text())
  .then(data => {
    document.getElementById('hueco-ensayos').innerHTML = data;
    initSeccionMarkdown('ensayos', 'Media/Ensayos/ensayos-index.json', 'Media/Ensayos/');
  });

//opiniones
fetch('componentes/menu-izquierdo/4-opiniones.html')
  .then(res => res.text())
  .then(data => {
    document.getElementById('hueco-opiniones').innerHTML = data;
    initSeccionMarkdown('opiniones', 'Media/Opiniones/opiniones-index.json', 'Media/Opiniones/');
  });

//reseñas libros
fetch('componentes/menu-izquierdo/5-resenas-libros.html')
  .then(res => res.text())
  .then(data => {
    document.getElementById('hueco-resenas-libros').innerHTML = data;
    initSeccionMarkdown('libros', 'Media/Libros/libros-index.json', 'Media/Libros/');
  });

//reseñas peliculas
fetch('componentes/menu-izquierdo/6-resenas-peliculas.html')
  .then(res => res.text())
  .then(data => {
    document.getElementById('hueco-resenas-peliculas').innerHTML = data;
    initSeccionMarkdown('peliculas', 'Media/Peliculas/peliculas-index.json', 'Media/Peliculas/');
  });

//recomendaciones música
fetch('componentes/menu-izquierdo/7-recomendaciones-musica.html')
  .then(res => res.text())
  .then(data => {
    document.getElementById('hueco-recomendaciones-musica').innerHTML = data;
    initSeccionMarkdown('musica', 'Media/Musica/musica-index.json', 'Media/Musica/');
  });

//proyectos
fetch('componentes/menu-izquierdo/8-proyectos.html')
  .then(res => res.text())
  .then(data => {
    document.getElementById('hueco-proyectos').innerHTML = data;
    initSeccionMarkdown('proyectos', 'Media/Proyectos/proyectos-index.json', 'Media/Proyectos/');
  });

//contacto
fetch('componentes/menu-izquierdo/9-contacto.html')
  .then(res => res.text())
  .then(data => {
    document.getElementById('hueco-contacto').innerHTML = data;
  });

/* ========================================================
   CARGA DE PESTAÑAS DEL ALTAR
   ======================================================== */
const altarTabs = ['libros', 'velas', 'cristales', 'joyas', 'tarot', 'daga', 'caliz'];
altarTabs.forEach(item => {
  fetch('componentes/altar/' + item + '.html')
    .then(res => res.text())
    .then(data => {
      document.getElementById('hueco-altar-' + item).innerHTML = data;
    });
});

/* ========================================================
   EFECTO RETRO: Rastro del Cursor (Mouse Trail)
   ======================================================== */
var trailContainer = document.createElement('div');
trailContainer.id = 'cursor-trail-container';
trailContainer.style.position = 'fixed';
trailContainer.style.top = '0';
trailContainer.style.left = '0';
trailContainer.style.pointerEvents = 'none';
trailContainer.style.zIndex = '999999';
document.body.appendChild(trailContainer);

var lastTrailTime = 0;
// Usamos las imágenes que subió el usuario a Media/Img
var imgNormal = "url('Media/Img/imperdible-cerrado-48.png')";
var imgHand = "url('Media/Img/imperdible-abierto-48.png')";

document.addEventListener('mousemove', function (e) {
  var now = Date.now();
  if (now - lastTrailTime < 25) return;
  lastTrailTime = now;

  var trail = document.createElement('div');

  var isPointer = false;
  if (e.target) {
    var compStyle = window.getComputedStyle(e.target);
    if (compStyle.cursor.indexOf('pointer') !== -1 || e.target.closest('a, button, .menu-item, .nav-btn, input, textarea')) {
      isPointer = true;
    }
  }

  trail.style.backgroundImage = isPointer ? imgHand : imgNormal;
  trail.style.backgroundRepeat = "no-repeat";
  trail.style.position = "absolute";

  trail.style.left = (e.clientX - 31) + "px";
  trail.style.top = (e.clientY - 8) + "px";
  trail.style.width = "48px";
  trail.style.height = "48px";
  trail.style.opacity = "0.6";
  trail.style.pointerEvents = "none";
  trail.style.transition = "opacity 0.15s linear, transform 0.15s linear";

  trailContainer.appendChild(trail);

  setTimeout(function () {
    trail.style.opacity = "0";
    trail.style.transform = "scale(0.7) translate(2px, 2px)";
  }, 20);

  setTimeout(function () {
    if (trail.parentNode) {
      trail.parentNode.removeChild(trail);
    }
  }, 200);
});

/* ========================================================
   NAVEGACIÓN CRUZADA (CROSS-TAB ROUTING)
   ======================================================== */
window.abrirPublicacionExterna = function(tabIndex, titulo) {
  // 1. Activar la pestaña deseada (tabIndex: 2 = Ensayos, 3 = Opiniones, etc.)
  var navBtns = document.querySelectorAll('.nav-btn');
  if (navBtns.length > tabIndex) {
    navBtns[tabIndex].click();
  }

  // 2. Darle tiempo al DOM de la pestaña para estar visible
  setTimeout(() => {
    // Buscar todas las tarjetas en la página
    var cards = document.querySelectorAll('.ensayo-card');
    var encontrada = false;
    
    cards.forEach(card => {
      var header = card.querySelector('.panel-header');
      if (header && header.textContent.includes(titulo)) {
        var btnAbrir = card.querySelector('.btn-abrir-ensayo');
        if (btnAbrir) {
          btnAbrir.click();
          encontrada = true;
        }
      }
    });
    
    if (!encontrada) {
       console.warn("Publicación no encontrada:", titulo);
    }
  }, 100);
};

/* ========================================================
   INICIALIZACIÓN DE LA PESTAÑA INICIO
   ======================================================== */
window.initInicioTab = function() {
  const ensayosList = document.getElementById('inicio-ensayos-list');
  const opinionesList = document.getElementById('inicio-opiniones-list');
  const archivoList = document.getElementById('inicio-archivo-list');

  if (!ensayosList || !opinionesList || !archivoList) return;

  // 1. Cargar Ensayos
  fetch('Media/Ensayos/ensayos-index.json')
    .then(res => res.json())
    .then(entradas => {
      // --- Ensayos Recientes (Max 3) ---
      ensayosList.innerHTML = '';
      if (entradas.length === 0) {
        ensayosList.innerHTML = '<p style="color: var(--crt-green); font-style: italic;">Aún no hay ensayos recientes.</p>';
      } else {
        const recientes = entradas.slice(0, 3);
        recientes.forEach(entrada => {
           ensayosList.innerHTML += `
            <div class="entry" data-title="${entrada.titulo}">
              <div class="entry-icon">📄</div>
              <div>
                <p class="entry-title">Título: ${entrada.titulo} <span class="fecha">(${entrada.fecha})</span></p>
                <a href="#" class="entry-link" onclick="event.preventDefault(); abrirPublicacionExterna(2, '${entrada.titulo}')">Leer más</a>
              </div>
            </div>
           `;
        });
      }

      // --- Archivo de Ensayos (Todos) ---
      archivoList.innerHTML = '';
      if (entradas.length === 0) {
        archivoList.innerHTML = '<div class="scrolllist__item" style="color: var(--crt-green); font-style: italic; pointer-events: none;">Sin archivo</div>';
      } else {
        entradas.forEach(entrada => {
          const div = document.createElement('div');
          div.className = 'scrolllist__item';
          div.setAttribute('role', 'option');
          div.setAttribute('tabindex', '0');
          div.textContent = `- ${entrada.titulo} (${entrada.fecha})`;
          div.onclick = function() {
            abrirPublicacionExterna(2, entrada.titulo);
          };
          archivoList.appendChild(div);
        });
      }
    })
    .catch(err => console.error("Error cargando ensayos en inicio:", err));

  // 2. Cargar Opiniones
  fetch('Media/Opiniones/opiniones-index.json')
    .then(res => res.json())
    .then(entradas => {
      opinionesList.innerHTML = '';
      if (entradas.length === 0) {
        opinionesList.innerHTML = '<p style="color: var(--crt-green); font-style: italic;">Aún no hay opiniones recientes.</p>';
      } else {
        const recientes = entradas.slice(0, 3);
        recientes.forEach(entrada => {
           opinionesList.innerHTML += `
            <div class="opinion" data-title="${entrada.titulo}">
              <p class="opinion-title">Opinión: ${entrada.titulo}</p>
              <p class="opinion-date">${entrada.fecha}</p>
              <p class="opinion-excerpt" style="font-size: 11px;">${entrada.resumen || ''}</p>
              <a href="#" class="entry-link" onclick="event.preventDefault(); abrirPublicacionExterna(3, '${entrada.titulo}')">Leer más</a>
            </div>
           `;
        });
      }
    })
    .catch(err => console.error("Error cargando opiniones en inicio:", err));
};

/* ========================================================
   MASCOTA: EYE OF CTHULHU
   ======================================================== */
window.addEventListener('load', function() {
  const osWindow = document.getElementById('osWindow');
  if (!osWindow) return;

  const pet = document.createElement('div');
  pet.id = 'cthulhu-pet';
  osWindow.appendChild(pet);

  let px = 100, py = 100;
  let vx = 1.5, vy = 1.5;
  let mouseX = -1000, mouseY = -1000;
  const radius = 250; // Radio de aggro
  let wanderAngle = Math.random() * Math.PI * 2; // Ángulo inicial para vagabundeo

  
  // Nombres de los GIFs (asegúrate de nombrarlos así en tu carpeta Media/Img)
  const skinNormal = "url('Media/Img/eye-normal.gif')";
  const skinAngry = "url('Media/Img/eye-angry.gif')";
  
  pet.style.backgroundImage = skinNormal;

  // Rastrear el mouse dentro del contenedor
  osWindow.addEventListener('mousemove', (e) => {
    const rect = osWindow.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
  });

  osWindow.addEventListener('mouseleave', () => {
    mouseX = -1000;
    mouseY = -1000;
  });

  function update() {
    const rect = osWindow.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    
    // Centro del Ojo
    const cx = px + 32;
    const cy = py + 32;
    
    const dx = mouseX - cx;
    const dy = mouseY - cy;
    const dist = Math.sqrt(dx*dx + dy*dy);
    
    let isAggro = false;
    let lookX = vx;
    let lookY = vy;
    
    let time = performance.now() * 0.001; // Tiempo en segundos para funciones trigonométricas
    
    if (dist < radius && mouseX > 0 && mouseY > 0 && mouseX < w && mouseY < h) {
      isAggro = true;
      // Modo Aggro (sigue al mouse)
      pet.style.backgroundImage = skinAngry;
      
      // Aceleración directa hacia el cursor en línea recta
      vx += dx * 0.0015;
      vy += dy * 0.0015;
      
      // Fricción para que el movimiento sea veloz pero controlado
      vx *= 0.96;
      vy *= 0.96;
      
      // Mira directamente al cursor
      lookX = dx;
      lookY = dy;
    } else {
      isAggro = false;
      // Modo Normal (vagando orgánicamente)
      pet.style.backgroundImage = skinNormal;
      
      // Rotar lentamente la dirección de vagabundeo
      wanderAngle += (Math.random() - 0.5) * 0.15;
      
      // Empuje hacia esa dirección
      vx += Math.cos(wanderAngle) * 0.08;
      vy += Math.sin(wanderAngle) * 0.08;
      
      // Fricción suave
      vx *= 0.98;
      vy *= 0.98;
      
      // Limitar velocidad máxima de vagabundeo
      let speed = Math.sqrt(vx*vx + vy*vy);
      if (speed > 1.8) {
        vx = (vx / speed) * 1.8;
        vy = (vy / speed) * 1.8;
      }
      
      // Mira hacia donde viaja
      lookX = vx;
      lookY = vy;
    }
    
    px += vx;
    py += vy;
    
    // Rebotes contra los bordes de la ventana (osWindow)
    if (px <= 0) { 
      px = 0; 
      vx = Math.abs(vx); 
      wanderAngle = Math.PI - wanderAngle; // Reflejar ángulo de vagabundeo
    }
    if (px >= w - 64) { 
      px = w - 64; 
      vx = -Math.abs(vx); 
      wanderAngle = Math.PI - wanderAngle;
    }
    if (py <= 0) { 
      py = 0; 
      vy = Math.abs(vy); 
      wanderAngle = -wanderAngle;
    }
    if (py >= h - 64) { 
      py = h - 64; 
      vy = -Math.abs(vy); 
      wanderAngle = -wanderAngle;
    }
    
    // Calcular el ángulo de rotación ("mirada") en grados
    let deg = Math.atan2(lookY, lookX) * (180 / Math.PI);
    
    // Como el GIF original mira hacia ABAJO (90 grados en el sistema de coordenadas de Canvas/CSS),
    // debemos restarle 90 grados al ángulo calculado para que coincida perfectamente.
    let rot = deg - 90; 
    
    // Aplicamos SOLO translate y rotate
    pet.style.transform = `translate(${px}px, ${py}px) rotate(${rot}deg)`;
    
    requestAnimationFrame(update);
  }
  
  update();
  
  // ========================================================================
  // MONSTRUO EN CAUTIVERIO
  // ========================================================================
  const jaula = document.getElementById('jaulaContenedor');
  const monstruoCautivo = document.getElementById('monstruoCautivo');
  
  // Nombres de archivos que deberás colocar en Media/Img/ y Media/Audio/
  const imgCautivoNormal = "url('Media/Img/cautivo-normal.gif')";
  const imgCautivoEnojado = "url('Media/Img/cautivo-enojado.gif')";
  
  // Audio: Asegúrate de colocar este archivo
  const audioGrito = new Audio('Media/Audio/grito.mp3');
  // Bajar un poco el volumen para que no sorde a los visitantes
  audioGrito.volume = 0.5; 
  
  if (jaula && monstruoCautivo) {
    let cageClicks = 0; // EASTER EGG
    // Físicas del monstruo de la jaula
    let cMx = 30, cMy = 30; // Posición inicial
    let cVx = 1, cVy = 0.7; // Velocidad de rebote
    let isPanicking = false; // Controla si ya está acelerado
    
    function updateCageMonster() {
      // Obtenemos las dimensiones de la jaula
      let jWidth = jaula.clientWidth;
      let jHeight = jaula.clientHeight;
      
      // Tamaño del sprite actualizado a 86px
      let sSize = 86;
      
      cMx += cVx;
      cMy += cVy;
      
      // Rebotes en los bordes de la jaula
      if (cMx <= 0) { cMx = 0; cVx = Math.abs(cVx); }
      if (cMx >= jWidth - sSize) { cMx = jWidth - sSize; cVx = -Math.abs(cVx); }
      if (cMy <= 0) { cMy = 0; cVy = Math.abs(cVy); }
      if (cMy >= jHeight - sSize) { cMy = jHeight - sSize; cVy = -Math.abs(cVy); }
      
      // Aplicar posición y orientar la imagen hacia donde viaja
      let scaleX = cVx > 0 ? -1 : 1;
      monstruoCautivo.style.left = cMx + 'px';
      monstruoCautivo.style.top = cMy + 'px';
      monstruoCautivo.style.transform = `scaleX(${scaleX})`;
      
      requestAnimationFrame(updateCageMonster);
    }
    
    // Iniciar movimiento
    updateCageMonster();

    jaula.addEventListener('click', () => {
      // EASTER EGG: Contador de clics
      cageClicks++;
      if (cageClicks === 30 && localStorage.getItem('easterEggFound') !== 'true') {
        const llave = document.getElementById('llave-supervivencia');
        if (llave) {
          llave.classList.add('key-drop-anim');
        }
      }

      // 1. Reproducir sonido (se reinicia si le haces clic muchas veces rápido)
      audioGrito.currentTime = 0;
      audioGrito.play().catch(e => console.log('El audio no pudo reproducirse automáticamente:', e));
      
      // 2. Cambiar la imagen a "enojado"
      monstruoCautivo.style.backgroundImage = imgCautivoEnojado;
      
      // 3. Hacer temblar la jaula
      jaula.classList.remove('shake');
      // Forzamos un "reflow" para que la animación se reinicie si ya estaba temblando
      void jaula.offsetWidth; 
      jaula.classList.add('shake');
      
      // Acelerar temporalmente al monstruo por el pánico (SOLO si no está en pánico ya)
      if (!isPanicking) {
        isPanicking = true;
        cVx *= 2.5; // Un poco más rápido y caótico
        cVy *= 2.5;
      }
      
      // 4. Volver a la normalidad después de un rato (por ejemplo, 1 segundo)
      // Usamos un timeout asociado al elemento para no superponer múltiples clics
      clearTimeout(jaula.timeoutId);
      jaula.timeoutId = setTimeout(() => {
        monstruoCautivo.style.backgroundImage = imgCautivoNormal;
        
        // Restaurar velocidad normal SOLO si estaba en pánico
        if (isPanicking) {
          cVx = cVx > 0 ? 1 : -1;
          cVy = cVy > 0 ? 0.7 : -0.7;
          isPanicking = false;
        }
      }, 1000);
    });
  }

  // EASTER EGG: Restaurar inventario al cargar la página
  if (localStorage.getItem('easterEggFound') === 'true') {
    const invKey = document.getElementById('inventory-key');
    if (invKey) invKey.style.display = 'block';
  }
});

// fetch manual de supervivencia
fetch('componentes/altar/manual-supervivencia.html')
  .then(res => res.text())
  .then(data => {
    let hueco = document.getElementById('hueco-manual-de-supervivencia');
    if (hueco) hueco.innerHTML = data;
  });