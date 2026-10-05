// Interfaz del probador virtual (versión PHP). Usa el motor de assets/motor.js.
(function () {
  'use strict';
  const V = window.VTryOn;
  const $ = (id) => document.getElementById(id);

  const estado = {
    modelo: null,           // File o data URL
    conjunto: [],           // { uid, src, nombre, categoria, prendaId, tiendaId, precio }
    autoFit: true,
    quitarFondo: true,
    verSilueta: false,
    resultado: null
  };

  let uid = 0;
  const cachePose = { clave: null, pose: null };
  const cacheCuerpo = { clave: null, datos: null };
  const cachePrendas = new Map();

  const toast = (msg) => {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('visible');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('visible'), 3200);
  };

  const etiquetaCategoria = (c) => ({ top: 'Camisas', bottom: 'Pantalones', head: 'Gorras', shoes: 'Zapatos', full: 'Vestidos' }[c] || 'Prendas');

  // ---------- conjunto ----------
  const sinConflictos = (lista, categoria) => {
    let r = lista.filter(l => l.categoria !== categoria);
    if (categoria === 'full') r = r.filter(l => l.categoria !== 'top' && l.categoria !== 'bottom');
    if (categoria === 'top' || categoria === 'bottom') r = r.filter(l => l.categoria !== 'full');
    return r;
  };

  const agregar = (capa) => {
    estado.conjunto = [...sinConflictos(estado.conjunto, capa.categoria), Object.assign({ uid: ++uid }, capa)];
    pintarConjunto();
    if (estado.resultado) componer();
  };

  const quitar = (id) => {
    estado.conjunto = estado.conjunto.filter(l => l.uid !== id);
    pintarConjunto();
    if (estado.resultado && estado.conjunto.length) componer();
  };

  // Marca en el catálogo las prendas que ya están en el conjunto
  function marcarPuestas() {
    const puestas = estado.conjunto.filter(c => c.prendaId).map(c => String(c.prendaId));
    document.querySelectorAll('#rejilla-catalogo .producto').forEach((art) => {
      const dentro = puestas.includes(art.dataset.id);
      art.classList.toggle('puesta', dentro);
      const b = art.querySelector('.btn-probar-prenda');
      if (b) b.textContent = dentro ? 'Puesta · quitar' : 'Probar';
    });
    const ver = $('ver-resultado');
    if (ver) ver.hidden = estado.conjunto.length === 0;
  }

  // Filtros del catálogo: tienda, categoría y búsqueda, sin recargar la página
  const filtros = { tienda: '0', categoria: 'todas', texto: '' };

  function filtrarCatalogo() {
    let visibles = 0;
    document.querySelectorAll('#rejilla-catalogo .producto').forEach((art) => {
      const okTienda = filtros.tienda === '0' || art.dataset.tienda === filtros.tienda;
      const okCat = filtros.categoria === 'todas' || art.dataset.categoria === filtros.categoria;
      const okTexto = !filtros.texto || art.dataset.buscar.includes(filtros.texto);
      const ver = okTienda && okCat && okTexto;
      art.hidden = !ver;
      if (ver) visibles++;
    });
    const conteo = $('conteo-catalogo');
    if (conteo) conteo.textContent = visibles + (visibles === 1 ? ' prenda' : ' prendas');
    const vacio = $('catalogo-vacio');
    if (vacio) vacio.hidden = visibles > 0;
  }

  function pintarConjunto() {
    const cont = $('conjunto');
    $('conjunto-total').textContent = estado.conjunto.length;
    marcarPuestas();
    if (!estado.conjunto.length) {
      cont.innerHTML = '<p class="vacio">Agrega prendas desde el catálogo o súbelas aquí: camisa, pantalón, gorra, zapatos o vestido. Se pone una por cada zona del cuerpo.</p>';
      return;
    }
    const orden = [...estado.conjunto].sort((a, b) => V.LAYER_ORDER.indexOf(b.categoria) - V.LAYER_ORDER.indexOf(a.categoria));
    cont.innerHTML = orden.map(l => `
      <div class="capa">
        <img src="${V.srcOf(l.src)}" alt="">
        <div class="capa-info">
          <strong>${l.nombre}</strong>
          <span>${etiquetaCategoria(l.categoria)}${l.precio ? ' · $' + Number(l.precio).toFixed(2) : ''}</span>
        </div>
        <button type="button" class="btn-quitar" data-uid="${l.uid}" aria-label="Quitar ${l.nombre}">✕</button>
      </div>`).join('');
    cont.querySelectorAll('.btn-quitar').forEach(b => b.addEventListener('click', () => quitar(Number(b.dataset.uid))));
  }

  // ---------- composición ----------
  const obtenerPose = async (clave, fuente) => {
    if (cachePose.clave === clave) return cachePose.pose;
    if (!window.PoseAPI) return null;
    try {
      const pose = await window.PoseAPI.detect(fuente);
      cachePose.clave = clave;
      cachePose.pose = pose;
      return pose;
    } catch (e) {
      console.warn('Detector:', e);
      return null;
    }
  };

  const lienzoPrenda = (capa, img) => {
    const k = capa.uid + '|' + estado.quitarFondo;
    if (!cachePrendas.has(k)) {
      if (cachePrendas.size > 30) cachePrendas.clear();
      cachePrendas.set(k, V.prepareGarment(img, estado.quitarFondo));
    }
    return cachePrendas.get(k);
  };

  async function componer() {
    if (!estado.modelo || !estado.conjunto.length) return null;
    const modelo = await V.loadImage(V.srcOf(estado.modelo));
    const s = Math.min(1, 1400 / Math.max(modelo.naturalWidth, modelo.naturalHeight));
    const W = Math.round(modelo.naturalWidth * s);
    const H = Math.round(modelo.naturalHeight * s);

    const base = document.createElement('canvas');
    base.width = W; base.height = H;
    base.getContext('2d').drawImage(modelo, 0, 0, W, H);

    let pose = null;
    if (estado.autoFit || estado.verSilueta) {
      pose = (estado.modelo === window.__maniquiUrl && window.__maniquiPose) ? window.__maniquiPose : await obtenerPose(estado.modelo, base);
    }
    const lm = pose ? pose.landmarks : null;
    const mask = pose ? pose.mask : null;

    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(base, 0, 0);

    let cuerpo = null;
    if (estado.autoFit && mask) {
      if (cacheCuerpo.clave !== estado.modelo) {
        const sW = lm ? Math.hypot((lm[11].x - lm[12].x) * W, (lm[11].y - lm[12].y) * H) : 0;
        cacheCuerpo.clave = estado.modelo;
        cacheCuerpo.datos = V.buildBodyData(base, mask, W, H, sW);
      }
      cuerpo = cacheCuerpo.datos;
    }

    const capas = [...estado.conjunto].sort((a, b) => V.LAYER_ORDER.indexOf(a.categoria) - V.LAYER_ORDER.indexOf(b.categoria));
    let ajustadas = 0, tapaCuerpo = false;

    for (const capa of capas) {
      if (capa.categoria === 'head' && tapaCuerpo && estado.autoFit) {
        V.restoreBodyParts(ctx, base, lm, mask, W, H);
        tapaCuerpo = false;
      }
      let img;
      try {
        img = await V.loadImage(V.srcOf(capa.src));
      } catch (e) {
        toast('No se pudo cargar "' + capa.nombre + '".');
        continue;
      }
      const g = lienzoPrenda(capa, img);
      const aspecto = g.height / g.width;
      const conSilueta = !!mask && ['top', 'bottom', 'full'].includes(capa.categoria);
      let lugar = estado.autoFit ? V.bodyPlacement(capa.categoria, W, H, aspecto, lm, conSilueta && capa.categoria === 'bottom') : null;
      const conCuerpo = !!lugar;
      if (!lugar) lugar = V.standardPlacement(capa.categoria, W, H, aspecto);
      if (conCuerpo && (capa.categoria === 'top' || capa.categoria === 'full')) lugar = V.sizeTopToTorso(lugar, g, lm, W, H, capa.categoria);

      const capaLienzo = document.createElement('canvas');
      capaLienzo.width = W; capaLienzo.height = H;
      const lctx = capaLienzo.getContext('2d', { willReadFrequently: true });
      const esTela = ['top', 'bottom', 'full'].includes(capa.categoria);
      const zapatosOk = capa.categoria === 'shoes' && estado.autoFit && V.drawShoes(lctx, g, lm, mask, W, H);
      let conMalla = false;
      if (!zapatosOk) {
        // Prendas de torso: deformación por malla TPS que sigue las curvas del cuerpo
        if (cuerpo && conCuerpo && esTela) {
          conMalla = V.warpGarmentToBody(lctx, g, lugar, capa.categoria, lm, mask, W, H);
        }
        if (!conMalla) V.drawRigid(lctx, g, lugar);
      }

      if (cuerpo && conCuerpo) {
        // Si la malla no se pudo aplicar, se usa el ajuste por filas de antes
        if (!conMalla && esTela) V.conformLayerToBody(capaLienzo, capa.categoria, mask, lm, W, H);
        if (conMalla && (capa.categoria === 'top' || capa.categoria === 'full')) {
          V.shadeGarmentVolume(capaLienzo, capa.categoria, lm, mask, W, H, 0.28);
        }
        if (capa.categoria === 'top' || capa.categoria === 'full') V.fillTopGaps(capaLienzo, mask, lm, W, H);
        V.fitLayerToBody(capaLienzo, cuerpo, W, H, capa.categoria === 'top' || capa.categoria === 'bottom');
      }

      ctx.save();
      ctx.globalAlpha = cuerpo ? 1 : 0.95;
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = cuerpo ? 10 : 18;
      ctx.shadowOffsetY = cuerpo ? 3 : 6;
      ctx.drawImage(capaLienzo, 0, 0);
      ctx.restore();

      if (conCuerpo) ajustadas++;
      if (capa.categoria === 'top' || capa.categoria === 'full') tapaCuerpo = true;
    }

    if (tapaCuerpo && estado.autoFit) V.restoreBodyParts(ctx, base, lm, mask, W, H);
    if (estado.verSilueta) V.drawSilhouette(ctx, mask, W, H);

    estado.resultado = canvas.toDataURL('image/jpeg', 0.92);
    const img = $('resultado-img');
    img.src = estado.resultado;
    img.hidden = false;
    $('resultado-vacio').hidden = true;
    $('descargar').href = estado.resultado;
    $('descargar').hidden = false;

    const chip = $('estado-ajuste');
    chip.hidden = false;
    if (!estado.autoFit) { chip.textContent = 'Posición estándar'; chip.className = 'chip gris'; }
    else if (ajustadas === capas.length) { chip.textContent = 'Ajustada a tu cuerpo'; chip.className = 'chip verde'; }
    else if (ajustadas > 0) { chip.textContent = 'Algunas prendas no encontraron su zona del cuerpo'; chip.className = 'chip ambar'; }
    else { chip.textContent = 'No se detectó el cuerpo: posición estándar'; chip.className = 'chip ambar'; }
    return estado.resultado;
  }

  const registrarPruebas = () => {
    if (!window.PRUEBA_URL) return;
    const delCatalogo = estado.conjunto.filter(c => c.prendaId);
    if (!delCatalogo.length) {
      console.warn('[V-TryOn] Ninguna prenda del conjunto viene del catálogo, no hay nada que registrar.');
      return;
    }
    delCatalogo.forEach((c) => {
      const datos = new FormData();
      datos.append('prenda_id', c.prendaId);
      datos.append('categoria', c.categoria);
      datos.append('metodo', estado.autoFit ? 'auto' : 'manual');
      fetch(window.PRUEBA_URL, { method: 'POST', body: datos })
        .then(r => r.json())
        .then((r) => {
          if (r && r.ok) console.log('[V-TryOn] Prueba registrada #' + r.id + ' (prenda ' + c.prendaId + ')');
          else console.error('[V-TryOn] La prueba NO se guardó:', r && r.error);
        })
        .catch(err => console.error('[V-TryOn] Error al registrar la prueba:', err));
    });
  };

  // ---------- cámara con silueta guía ----------
  const camara = { stream: null, timer: null, ocupado: false, okDesde: null, cuenta: null };

  const recorte = (alto) => {
    const v = $('video');
    if (!v || !v.videoWidth) return null;
    const vw = v.videoWidth, vh = v.videoHeight;
    let cw, ch;
    if (vw / vh > 0.75) { ch = vh; cw = vh * 0.75; } else { cw = vw; ch = vw / 0.75; }
    const sx = (vw - cw) / 2, sy = (vh - ch) / 2;
    const e = Math.min(1, alto / ch);
    const c = document.createElement('canvas');
    c.width = Math.round(cw * e); c.height = Math.round(ch * e);
    const ctx = c.getContext('2d');
    ctx.translate(c.width, 0); ctx.scale(-1, 1);
    ctx.drawImage(v, sx, sy, cw, ch, 0, 0, c.width, c.height);
    return c;
  };

  const cerrarCamara = () => {
    clearInterval(camara.timer);
    if (camara.stream) camara.stream.getTracks().forEach(t => t.stop());
    camara.stream = null; camara.okDesde = null; camara.cuenta = null;
    $('modal-camara').hidden = true;
  };

  const tomarFoto = () => {
    const c = recorte(1600);
    if (!c) return;
    c.toBlob((blob) => {
      if (!blob) return;
      usarModelo(new File([blob], 'foto-guia.jpg', { type: 'image/jpeg' }));
      cerrarCamara();
      toast('Foto lista. Ahora agrega tus prendas.');
    }, 'image/jpeg', 0.92);
  };

  const abrirCamara = async () => {
    $('modal-camara').hidden = false;
    $('camara-msg').textContent = 'Abriendo la cámara...';
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      $('camara-msg').textContent = 'Tu navegador no permite usar la cámara aquí.';
      return;
    }
    try {
      camara.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      const v = $('video');
      v.srcObject = camara.stream;
      await v.play();
      if (window.PoseAPI) window.PoseAPI.preload();
    } catch (e) {
      $('camara-msg').textContent = 'No se pudo abrir la cámara. Revisa el permiso en el candado de la barra de direcciones.';
      return;
    }
    camara.timer = setInterval(async () => {
      if (camara.ocupado || !window.PoseAPI) return;
      const frame = recorte(480);
      if (!frame) return;
      camara.ocupado = true;
      try {
        const pose = await window.PoseAPI.detect(frame);
        const r = V.checkPoseForPhoto(pose && pose.landmarks);
        $('camara-msg').textContent = r.ok && camara.cuenta ? camara.cuenta : r.msg;
        $('guia').classList.toggle('ok', r.ok);
        if (r.ok) {
          if (!camara.okDesde) camara.okDesde = Date.now();
          if (Date.now() - camara.okDesde > 900 && camara.cuenta === null) {
            camara.cuenta = 3;
            const bajar = () => {
              if (camara.cuenta === null) return;
              if (camara.cuenta === 0) { tomarFoto(); return; }
              $('camara-msg').textContent = camara.cuenta;
              camara.cuenta--;
              setTimeout(bajar, 1000);
            };
            bajar();
          }
        } else {
          camara.okDesde = null;
        }
      } catch (e) {
        $('camara-msg').textContent = 'Cargando el detector de cuerpo...';
      } finally {
        camara.ocupado = false;
      }
    }, 450);
  };

  // ---------- modelo ----------
  function usarModelo(archivoOUrl) {
    estado.modelo = archivoOUrl;
    cachePose.clave = null; cacheCuerpo.clave = null;
    const prev = $('modelo-preview');
    prev.src = V.srcOf(archivoOUrl);
    prev.hidden = false;
    $('modelo-vacio').hidden = true;
    if (estado.conjunto.length) componer();
  }

  // ---------- eventos ----------
  document.addEventListener('DOMContentLoaded', () => {
    pintarConjunto();

    $('modelo-input').addEventListener('change', (e) => { if (e.target.files[0]) usarModelo(e.target.files[0]); });
    $('prenda-input').addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const categoria = $('prenda-categoria').value;
      agregar({ src: f, nombre: 'Mi prenda (' + etiquetaCategoria(categoria) + ')', categoria, prendaId: null, precio: 0 });
      e.target.value = '';
    });

    document.querySelectorAll('.btn-maniqui').forEach(b => b.addEventListener('click', async () => {
      try {
        const m = await V.buildMannequin(b.dataset.oscuro === '1');
        window.__maniquiUrl = m.url;
        window.__maniquiPose = m.pose;
        usarModelo(m.url);
        toast('Maniquí de prueba cargado.');
      } catch (e) { toast('No se pudo cargar el maniquí.'); }
    }));

    $('btn-camara').addEventListener('click', abrirCamara);
    $('cerrar-camara').addEventListener('click', cerrarCamara);
    $('foto-manual').addEventListener('click', tomarFoto);

    $('chk-autofit').addEventListener('change', (e) => { estado.autoFit = e.target.checked; if (estado.resultado) componer(); });
    $('chk-fondo').addEventListener('change', (e) => { estado.quitarFondo = e.target.checked; cachePrendas.clear(); if (estado.resultado) componer(); });
    $('chk-silueta').addEventListener('change', (e) => { estado.verSilueta = e.target.checked; if (estado.resultado) componer(); });

    $('btn-probar').addEventListener('click', async () => {
      if (!estado.modelo) { toast('Primero sube tu foto o usa el maniquí.'); return; }
      if (!estado.conjunto.length) { toast('Agrega al menos una prenda.'); return; }
      $('btn-probar').disabled = true;
      $('cargando').hidden = false;
      try {
        await componer();
        registrarPruebas();
      } catch (e) {
        toast(e.message || 'No se pudo generar el resultado.');
      } finally {
        $('cargando').hidden = true;
        $('btn-probar').disabled = false;
      }
    });

    if (window.PRENDA_INICIAL) {
      const p = window.PRENDA_INICIAL;
      agregar({ src: p.imagen, nombre: p.nombre, categoria: p.categoria, prendaId: p.id, tiendaId: p.tienda, precio: p.precio });
    }

    document.querySelectorAll('.btn-probar-prenda').forEach(b => b.addEventListener('click', () => {
      const puesta = estado.conjunto.find(c => String(c.prendaId) === b.dataset.id);
      if (puesta) {
        quitar(puesta.uid);
        toast('"' + b.dataset.nombre + '" quitada del conjunto.');
        return;
      }
      agregar({
        src: b.dataset.imagen,
        nombre: b.dataset.nombre,
        categoria: b.dataset.categoria,
        prendaId: b.dataset.id,
        tiendaId: b.dataset.tienda || null,
        precio: Number(b.dataset.precio || 0)
      });
      toast('"' + b.dataset.nombre + '" agregada a tu conjunto.');
    }));

    // Chips de tienda y de categoría
    const grupoChips = (idGrupo, campo, atributo) => {
      const grupo = $(idGrupo);
      if (!grupo) return;
      grupo.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => {
        grupo.querySelectorAll('.chip').forEach(c => c.classList.remove('activo'));
        chip.classList.add('activo');
        filtros[campo] = chip.dataset[atributo];
        filtrarCatalogo();
      }));
    };
    grupoChips('chips-tienda', 'tienda', 'tienda');
    grupoChips('chips-categoria', 'categoria', 'categoria');

    const buscador = $('buscar-prenda');
    if (buscador) buscador.addEventListener('input', (e) => {
      filtros.texto = e.target.value.trim().toLowerCase();
      filtrarCatalogo();
    });

    const verResultado = $('ver-resultado');
    if (verResultado) verResultado.addEventListener('click', () => {
      document.querySelector('.probador').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    const irCatalogo = $('ir-catalogo');
    if (irCatalogo) irCatalogo.addEventListener('click', () => {
      $('catalogo-probador').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    filtrarCatalogo();
  });
})();
