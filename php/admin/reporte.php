<?php
require_once __DIR__ . '/../includes/config.php';
exigirAdmin();

$mas = db()->query('SELECT * FROM vista_mas_probadas')->fetchAll();
$porTienda = db()->query('SELECT * FROM vista_pruebas_por_tienda')->fetchAll();
$porCategoria = db()->query(
    'SELECT c.nombre AS categoria, COUNT(p.id) AS veces
     FROM pruebas p JOIN categorias c ON c.id = p.categoria_id
     GROUP BY c.nombre ORDER BY veces DESC'
)->fetchAll();
$ultimas = db()->query(
    'SELECT pr.fecha, COALESCE(p.nombre, "Prenda eliminada") AS prenda,
            COALESCE(t.nombre, "Sin tienda") AS tienda, COALESCE(us.nombre, "Visitante") AS usuario
     FROM pruebas pr
     LEFT JOIN prendas p ON p.id = pr.prenda_id
     LEFT JOIN tiendas t ON t.id = pr.tienda_id
     LEFT JOIN usuarios us ON us.id = pr.usuario_id
     ORDER BY pr.fecha DESC LIMIT 10'
)->fetchAll();
$maximo = $mas ? max(1, (int) $mas[0]['veces_probada']) : 1;
$total = array_sum(array_map(fn($f) => (int) $f['veces_probada'], $mas));

$titulo = 'Reporte';
require_once __DIR__ . '/../includes/header.php';
?>
<h1>Reporte de productos más probados</h1>
<nav class="sub-menu">
  <a href="index.php">Resumen</a>
  <a href="tiendas.php">Tiendas</a>
  <a href="prendas.php">Catálogo</a>
  <a href="usuarios.php">Usuarios</a>
  <a class="activo" href="reporte.php">Reporte</a>
</nav>

<section class="panel">
  <p class="mini"><?= (int) $total ?> pruebas registradas en total. Cada vez que un cliente se prueba una prenda, se suma aquí.</p>
  <table class="tabla">
    <tr><th>#</th><th>Prenda</th><th>Categoría</th><th>Tienda</th><th>Veces probada</th><th>Participación</th></tr>
    <?php foreach ($mas as $i => $m): ?>
      <tr>
        <td><?= $i + 1 ?></td>
        <td><?= e($m['nombre']) ?></td>
        <td><?= e($m['categoria']) ?></td>
        <td><?= e($m['tienda']) ?></td>
        <td><strong><?= (int) $m['veces_probada'] ?></strong></td>
        <td><div class="barra-dato"><span style="width: <?= (int) round(((int) $m['veces_probada'] / $maximo) * 100) ?>%"></span></div></td>
      </tr>
    <?php endforeach; ?>
  </table>
</section>

<div class="dos-columnas">
  <section class="panel">
    <h2>Pruebas por tienda</h2>
    <table class="tabla">
      <tr><th>Tienda</th><th>Pruebas</th></tr>
      <?php foreach ($porTienda as $t): ?>
        <tr><td><?= e($t['tienda']) ?></td><td><strong><?= (int) $t['veces_probada'] ?></strong></td></tr>
      <?php endforeach; ?>
    </table>
    <?php if (!$porTienda): ?><p class="gris">Sin datos todavía.</p><?php endif; ?>
  </section>

  <section class="panel">
    <h2>Pruebas por categoría</h2>
    <table class="tabla">
      <tr><th>Categoría</th><th>Pruebas</th></tr>
      <?php foreach ($porCategoria as $c): ?>
        <tr><td><?= e($c['categoria']) ?></td><td><strong><?= (int) $c['veces'] ?></strong></td></tr>
      <?php endforeach; ?>
    </table>
    <?php if (!$porCategoria): ?><p class="gris">Sin datos todavía.</p><?php endif; ?>
  </section>
</div>

<section class="panel">
  <h2>Últimas 10 pruebas</h2>
  <table class="tabla">
    <tr><th>Fecha</th><th>Prenda</th><th>Tienda</th><th>Usuario</th></tr>
    <?php foreach ($ultimas as $x): ?>
      <tr><td><?= e(date('d/m/Y H:i', strtotime($x['fecha']))) ?></td><td><?= e($x['prenda']) ?></td><td><?= e($x['tienda']) ?></td><td><?= e($x['usuario']) ?></td></tr>
    <?php endforeach; ?>
  </table>
  <?php if (!$ultimas): ?><p class="gris">Todavía nadie se ha probado una prenda.</p><?php endif; ?>
</section>
<?php require_once __DIR__ . '/../includes/footer.php'; ?>
