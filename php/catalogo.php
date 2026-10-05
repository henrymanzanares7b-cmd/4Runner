<?php
$titulo = 'Catálogo';
require_once __DIR__ . '/includes/header.php';

$tienda = isset($_GET['tienda']) ? (int) $_GET['tienda'] : 0;
$categoria = isset($_GET['categoria']) ? (int) $_GET['categoria'] : 0;
$q = trim($_GET['q'] ?? '');

$sql = 'SELECT p.*, c.nombre AS categoria, c.clave AS categoria_clave, t.nombre AS tienda
        FROM prendas p
        JOIN categorias c ON c.id = p.categoria_id
        LEFT JOIN tiendas t ON t.id = p.tienda_id
        WHERE p.activa = 1 AND (t.id IS NULL OR t.activa = 1)';
$params = [];
if ($tienda > 0)    { $sql .= ' AND p.tienda_id = :tienda';   $params[':tienda'] = $tienda; }
if ($categoria > 0) { $sql .= ' AND p.categoria_id = :cat';   $params[':cat'] = $categoria; }
if ($q !== '')      { $sql .= ' AND (p.nombre LIKE :q OR p.color LIKE :q)'; $params[':q'] = '%' . $q . '%'; }
$sql .= ' ORDER BY p.fecha_creacion DESC';

$stmt = db()->prepare($sql);
$stmt->execute($params);
$prendas = $stmt->fetchAll();
$cfg = ajustes();
?>
<h1>Catálogo de prendas</h1>
<form class="filtros" method="get">
  <select name="tienda">
    <option value="0">Todas las tiendas</option>
    <?php foreach (tiendas(true) as $t): ?>
      <option value="<?= (int) $t['id'] ?>" <?= $tienda === (int) $t['id'] ? 'selected' : '' ?>><?= e($t['nombre']) ?></option>
    <?php endforeach; ?>
  </select>
  <select name="categoria">
    <option value="0">Todas las categorías</option>
    <?php foreach (categorias() as $c): ?>
      <option value="<?= (int) $c['id'] ?>" <?= $categoria === (int) $c['id'] ? 'selected' : '' ?>><?= e($c['nombre']) ?></option>
    <?php endforeach; ?>
  </select>
  <input type="search" name="q" value="<?= e($q) ?>" placeholder="Buscar prenda o color">
  <button class="btn" type="submit">Filtrar</button>
</form>

<div class="rejilla productos">
<?php foreach ($prendas as $p): ?>
  <article class="tarjeta producto">
    <div class="foto"><img src="uploads/<?= e($p['imagen']) ?>" alt="<?= e($p['nombre']) ?>"></div>
    <span class="etiqueta"><?= e($p['categoria']) ?></span>
    <h3><?= e($p['nombre']) ?></h3>
    <p class="mini">Color: <?= e($p['color']) ?><?= $p['tallas'] ? ' · Tallas: ' . e($p['tallas']) : '' ?></p>
    <p class="mini tienda">🏪 <?= e($p['tienda'] ?: 'Sin tienda') ?></p>
    <?php if ((int) $cfg['mostrar_precios'] === 1): ?><p class="precio"><?= dinero($p['precio']) ?></p><?php endif; ?>
    <a class="btn" href="probador.php?prenda=<?= (int) $p['id'] ?>">Probar</a>
  </article>
<?php endforeach; ?>
<?php if (!$prendas): ?><p class="gris">No hay prendas que coincidan con el filtro.</p><?php endif; ?>
</div>
<?php require_once __DIR__ . '/includes/footer.php'; ?>
