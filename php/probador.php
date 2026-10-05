<?php
$titulo = 'Probador virtual';
require_once __DIR__ . '/includes/header.php';

$cfg = ajustes();

$prendas = db()->query(
    'SELECT p.*, c.clave AS categoria_clave, c.nombre AS categoria, t.nombre AS tienda
     FROM prendas p
     JOIN categorias c ON c.id = p.categoria_id
     LEFT JOIN tiendas t ON t.id = p.tienda_id
     WHERE p.activa = 1 AND (t.id IS NULL OR t.activa = 1)
     ORDER BY c.id, p.nombre'
)->fetchAll();

// Prenda que viene del catálogo con el botón "Probar"
$prendaInicial = null;
if (isset($_GET['prenda'])) {
    foreach ($prendas as $p) {
        if ((int) $p['id'] === (int) $_GET['prenda']) { $prendaInicial = $p; break; }
    }
}
?>
<h1>Estudio de prueba virtual</h1>
<p class="gris">Sube una foto de cuerpo completo, arma tu conjunto y la ropa sigue tu silueta sola.</p>

<div class="probador">
  <section class="panel">
    <h2><span class="paso">1</span> Tu foto y tus prendas</h2>

    <div class="dos-columnas">
      <div>
        <label class="etiqueta-campo">Tu foto (modelo)</label>
        <div class="zona">
          <p id="modelo-vacio">Sube una foto de frente, de cuerpo completo y con los brazos un poco separados.</p>
          <img id="modelo-preview" hidden alt="Tu foto">
        </div>
        <input type="file" id="modelo-input" accept="image/*">
        <button type="button" class="btn ancho" id="btn-camara">📷 Tomarme una foto con la silueta guía</button>
        <div class="dos-columnas">
          <button type="button" class="btn secundario btn-maniqui" data-oscuro="0">Maniquí (claro)</button>
          <button type="button" class="btn secundario btn-maniqui" data-oscuro="1">Maniquí (oscuro)</button>
        </div>
      </div>

      <div>
        <label class="etiqueta-campo">Agregar una prenda propia</label>
        <select id="prenda-categoria">
          <?php foreach (categorias() as $c): ?>
            <option value="<?= e($c['clave']) ?>"><?= e($c['nombre']) ?></option>
          <?php endforeach; ?>
        </select>
        <input type="file" id="prenda-input" accept="image/*">
        <p class="mini">Funciona mejor con la prenda sola sobre fondo liso.</p>

        <label class="etiqueta-campo">Tu conjunto (<span id="conjunto-total">0</span>)</label>
        <div id="conjunto" class="conjunto"></div>
      </div>
    </div>

    <div class="opciones">
      <label><input type="checkbox" id="chk-autofit" <?= (int) $cfg['ajuste_auto_defecto'] === 1 ? 'checked' : '' ?>> Ajuste al cuerpo</label>
      <label><input type="checkbox" id="chk-fondo" <?= (int) $cfg['quitar_fondo_defecto'] === 1 ? 'checked' : '' ?>> Quitar fondo de la prenda</label>
      <label><input type="checkbox" id="chk-silueta"> Ver silueta</label>
    </div>

    <div class="acciones-probador">
      <button type="button" class="enlace" id="ir-catalogo">👕 Ver el catálogo completo</button>
      <button type="button" class="btn grande" id="btn-probar">✦ Probar conjunto</button>
    </div>
  </section>

  <section class="panel">
    <h2><span class="paso">2</span> Resultado <span id="estado-ajuste" class="chip" hidden></span></h2>
    <div class="resultado">
      <p id="resultado-vacio" class="gris">Aquí aparecerá tu foto con la ropa puesta.</p>
      <img id="resultado-img" hidden alt="Resultado del probador">
      <p id="cargando" hidden class="gris">Procesando la imagen...</p>
    </div>
    <a id="descargar" class="btn ancho" hidden download="mi-look.jpg">Descargar imagen</a>
  </section>
</div>

<section class="panel" id="catalogo-probador">
  <div class="cabecera-catalogo">
    <h2><span class="paso">3</span> Catálogo completo <span class="mini" id="conteo-catalogo"><?= count($prendas) ?> prendas</span></h2>
    <div class="acciones-catalogo">
      <input type="search" id="buscar-prenda" placeholder="Buscar prenda o color...">
      <button type="button" class="btn secundario" id="ver-resultado" hidden>Ver resultado</button>
    </div>
  </div>

  <?php if (tiendas(true)): ?>
  <div class="chips" id="chips-tienda">
    <button type="button" class="chip activo" data-tienda="0">🏪 Todas las tiendas</button>
    <?php foreach (tiendas(true) as $t): ?>
      <button type="button" class="chip" data-tienda="<?= (int) $t['id'] ?>">🏪 <?= e($t['nombre']) ?></button>
    <?php endforeach; ?>
  </div>
  <?php endif; ?>

  <div class="chips" id="chips-categoria">
    <button type="button" class="chip activo" data-categoria="todas">Todas</button>
    <?php foreach (categorias() as $c): ?>
      <button type="button" class="chip" data-categoria="<?= e($c['clave']) ?>"><?= e($c['nombre']) ?></button>
    <?php endforeach; ?>
  </div>

  <div class="rejilla productos" id="rejilla-catalogo">
  <?php foreach ($prendas as $p): ?>
    <article class="tarjeta producto"
      data-id="<?= (int) $p['id'] ?>"
      data-tienda="<?= (int) $p['tienda_id'] ?>"
      data-categoria="<?= e($p['categoria_clave']) ?>"
      data-buscar="<?= e(mb_strtolower($p['nombre'] . ' ' . $p['color'] . ' ' . $p['categoria'])) ?>">
      <div class="foto">
        <img src="uploads/<?= e($p['imagen']) ?>" alt="<?= e($p['nombre']) ?>">
        <span class="marca-puesta">✓</span>
      </div>
      <h3><?= e($p['nombre']) ?></h3>
      <p class="mini"><?= e($p['categoria']) ?><?= $p['tallas'] ? ' · ' . e($p['tallas']) : '' ?></p>
      <p class="mini tienda">🏪 <?= e($p['tienda'] ?: 'Sin tienda') ?></p>
      <?php if ((int) $cfg['mostrar_precios'] === 1): ?><p class="precio"><?= dinero($p['precio']) ?></p><?php endif; ?>
      <button type="button" class="btn btn-probar-prenda"
        data-id="<?= (int) $p['id'] ?>"
        data-nombre="<?= e($p['nombre']) ?>"
        data-categoria="<?= e($p['categoria_clave']) ?>"
        data-tienda="<?= (int) $p['tienda_id'] ?>"
        data-precio="<?= e((string) $p['precio']) ?>"
        data-imagen="uploads/<?= e($p['imagen']) ?>">Probar</button>
    </article>
  <?php endforeach; ?>
  </div>

  <p class="gris mini" id="catalogo-vacio" hidden>No hay prendas que coincidan con el filtro.</p>
  <p class="mini">Toca "Probar" en cada prenda para armar tu conjunto: se pone una por cada zona del cuerpo (camisa, pantalón, gorra, zapatos o vestido).</p>
</section>

<!-- Cámara con silueta guía -->
<div id="modal-camara" class="modal" hidden>
  <div class="modal-caja">
    <div class="modal-titulo">
      <strong>Foto con silueta guía</strong>
      <button type="button" id="cerrar-camara" aria-label="Cerrar cámara">✕</button>
    </div>
    <div class="camara">
      <video id="video" playsinline muted></video>
      <svg id="guia" viewBox="0 0 300 400" preserveAspectRatio="none">
        <g fill="none" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">
          <ellipse cx="150" cy="50" rx="21" ry="26"/>
          <path d="M138 74 L138 84 Q112 88 100 96 Q90 102 88 116 L80 180 Q78 196 74 208 L70 224 Q72 230 80 226 L88 208 Q94 192 98 176 L106 132 L108 196 Q106 214 110 226 L112 300 L114 372 Q104 378 106 384 L138 384 Q142 376 140 368 L146 250 L150 236 L154 250 L160 368 Q158 376 162 384 L194 384 Q196 378 186 372 L188 300 L190 226 Q194 214 192 196 L194 132 L202 176 Q206 192 212 208 L220 226 Q228 230 230 224 L226 208 Q222 196 220 180 L212 116 Q210 102 200 96 Q188 88 162 84 L162 74"/>
        </g>
      </svg>
      <div id="camara-msg" class="camara-msg">Colócate dentro de la silueta</div>
    </div>
    <button type="button" class="btn ancho" id="foto-manual">Tomar foto ahora</button>
    <p class="mini">Deja la cámara a la altura del pecho, a unos 2 o 3 metros. De frente, con los brazos un poco separados y las manos fuera de los bolsillos.</p>
  </div>
</div>

<script>
  window.PRUEBA_URL = 'api/prueba.php';
  <?php if ($prendaInicial): ?>
  window.PRENDA_INICIAL = {
    id: <?= (int) $prendaInicial['id'] ?>,
    nombre: <?= json_encode($prendaInicial['nombre'], JSON_UNESCAPED_UNICODE) ?>,
    categoria: <?= json_encode($prendaInicial['categoria_clave']) ?>,
    imagen: <?= json_encode('uploads/' . $prendaInicial['imagen']) ?>,
    precio: <?= (float) $prendaInicial['precio'] ?>,
    tienda: <?= (int) $prendaInicial['tienda_id'] ?>
  };
  <?php endif; ?>
</script>
<script src="assets/motor.js"></script>
<script src="assets/probador.js"></script>
<script type="module" src="assets/pose.js"></script>
<?php require_once __DIR__ . '/includes/footer.php'; ?>
