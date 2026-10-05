<?php
$titulo = 'Tiendas';
require_once __DIR__ . '/includes/header.php';

$tiendas = db()->query(
    'SELECT t.*, COUNT(p.id) AS prendas
     FROM tiendas t
     LEFT JOIN prendas p ON p.tienda_id = t.id AND p.activa = 1
     WHERE t.activa = 1
     GROUP BY t.id
     ORDER BY t.nombre'
)->fetchAll();
?>
<section class="hero">
  <h1>Pruébate la ropa antes de comprarla</h1>
  <p>Elige una tienda local, escoge las prendas que te gusten y míralas sobre tu propia foto.</p>
  <a class="btn grande" href="probador.php">Ir al probador virtual</a>
</section>

<h2>Tiendas registradas</h2>
<div class="rejilla tiendas">
<?php foreach ($tiendas as $t): ?>
  <article class="tarjeta">
    <h3><?= e($t['nombre']) ?></h3>
    <p class="gris"><?= e($t['descripcion']) ?></p>
    <p class="mini">Encargado: <?= e($t['encargado'] ?: '—') ?> · Tel: <?= e($t['telefono'] ?: '—') ?></p>
    <p class="mini"><strong><?= (int) $t['prendas'] ?></strong> prendas disponibles</p>
    <a class="btn" href="catalogo.php?tienda=<?= (int) $t['id'] ?>">Ver catálogo</a>
  </article>
<?php endforeach; ?>
<?php if (!$tiendas): ?><p class="gris">Todavía no hay tiendas registradas.</p><?php endif; ?>
</div>
<?php require_once __DIR__ . '/includes/footer.php'; ?>
