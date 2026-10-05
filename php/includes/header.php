<?php
require_once __DIR__ . '/config.php';
$cfg = ajustes();
$u = usuarioActual();
$base = urlBase();
$titulo = $titulo ?? $cfg['nombre_sitio'];
?>
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title><?= e($titulo) ?> · <?= e($cfg['nombre_sitio']) ?></title>
<link rel="stylesheet" href="<?= $base ?>assets/estilo.css">
</head>
<body>
<header class="barra">
  <a class="marca" href="<?= $base ?>index.php">
    <span class="logo">✦</span>
    <span>
      <strong><?= e($cfg['nombre_sitio']) ?></strong>
      <small><?= e($cfg['eslogan']) ?></small>
    </span>
  </a>
  <nav class="menu">
    <a href="<?= $base ?>index.php">Tiendas</a>
    <a href="<?= $base ?>catalogo.php">Catálogo</a>
    <a href="<?= $base ?>probador.php">Probador virtual</a>
    <?php if ($u): ?><a href="<?= $base ?>perfil.php">Mi perfil</a><?php endif; ?>
    <?php if (esAdmin()): ?><a class="destacado" href="<?= $base ?>admin/index.php">Admin</a><?php endif; ?>
  </nav>
  <div class="sesion">
    <?php if ($u): ?>
      <span class="avatar"><?= e(mb_strtoupper(mb_substr($u['nombre'], 0, 1))) ?></span>
      <span class="nombre"><?= e($u['nombre']) ?></span>
      <a class="btn-salir" href="<?= $base ?>logout.php">Salir</a>
    <?php else: ?>
      <a class="btn" href="<?= $base ?>login.php">Ingresar</a>
    <?php endif; ?>
  </div>
</header>
<main class="contenido">
<?php if ($m = mensaje()): ?><div class="aviso"><?= e($m) ?></div><?php endif; ?>
