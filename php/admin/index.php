<?php
require_once __DIR__ . '/../includes/config.php';
exigirAdmin();

$r = db()->query('SELECT * FROM vista_resumen_admin')->fetch();
$top = db()->query('SELECT * FROM vista_mas_probadas LIMIT 5')->fetchAll();

$titulo = 'Panel de administración';
require_once __DIR__ . '/../includes/header.php';
?>
<h1>Panel de administración</h1>
<nav class="sub-menu">
  <a class="activo" href="index.php">Resumen</a>
  <a href="tiendas.php">Tiendas</a>
  <a href="prendas.php">Catálogo</a>
  <a href="usuarios.php">Usuarios</a>
  <a href="reporte.php">Reporte</a>
</nav>

<div class="rejilla metricas">
  <div class="metrica"><strong><?= (int) $r['total_tiendas'] ?></strong><span>Tiendas</span></div>
  <div class="metrica"><strong><?= (int) $r['total_prendas'] ?></strong><span>Prendas</span></div>
  <div class="metrica"><strong><?= (int) $r['prendas_visibles'] ?></strong><span>Visibles</span></div>
  <div class="metrica"><strong><?= (int) $r['total_usuarios'] ?></strong><span>Usuarios</span></div>
  <div class="metrica"><strong><?= (int) $r['total_pruebas'] ?></strong><span>Pruebas</span></div>
</div>

<section class="panel">
  <h2>Top 5 de productos más probados</h2>
  <table class="tabla">
    <tr><th>#</th><th>Prenda</th><th>Categoría</th><th>Tienda</th><th>Veces probada</th></tr>
    <?php foreach ($top as $i => $t): ?>
      <tr><td><?= $i + 1 ?></td><td><?= e($t['nombre']) ?></td><td><?= e($t['categoria']) ?></td><td><?= e($t['tienda']) ?></td><td><strong><?= (int) $t['veces_probada'] ?></strong></td></tr>
    <?php endforeach; ?>
  </table>
  <a class="btn" href="reporte.php">Ver reporte completo</a>
</section>
<?php require_once __DIR__ . '/../includes/footer.php'; ?>
