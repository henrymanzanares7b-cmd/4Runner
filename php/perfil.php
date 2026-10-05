<?php
require_once __DIR__ . '/includes/config.php';
exigirSesion();
$u = usuarioActual();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $nombre = trim($_POST['nombre'] ?? '');
    $talla = $_POST['talla'] ?? '';
    $tallas = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
    $stmt = db()->prepare('UPDATE usuarios SET nombre = :n, talla_preferida = :t WHERE id = :id');
    $stmt->execute([
        ':n' => $nombre !== '' ? $nombre : $u['nombre'],
        ':t' => in_array($talla, $tallas, true) ? $talla : null,
        ':id' => $u['id'],
    ]);
    $stmt = db()->prepare('SELECT * FROM usuarios WHERE id = :id');
    $stmt->execute([':id' => $u['id']]);
    $u = $stmt->fetch();
    unset($u['password_hash']);
    $_SESSION['usuario'] = $u;
    mensaje('Perfil guardado.');
    header('Location: perfil.php');
    exit;
}

$stmt = db()->prepare(
    'SELECT pr.fecha, pr.metodo, p.nombre AS prenda, c.nombre AS categoria, t.nombre AS tienda
     FROM pruebas pr
     LEFT JOIN prendas p ON p.id = pr.prenda_id
     JOIN categorias c ON c.id = pr.categoria_id
     LEFT JOIN tiendas t ON t.id = pr.tienda_id
     WHERE pr.usuario_id = :id
     ORDER BY pr.fecha DESC LIMIT 20'
);
$stmt->execute([':id' => $u['id']]);
$historial = $stmt->fetchAll();

$titulo = 'Mi perfil';
require_once __DIR__ . '/includes/header.php';
?>
<h1>Mi perfil</h1>
<div class="dos-columnas">
  <section class="panel">
    <h2>Mis datos</h2>
    <p class="mini">Correo registrado</p>
    <p><strong><?= e($u['correo']) ?></strong></p>
    <p class="mini">Rol: <?= (int) $u['rol_id'] === 1 ? 'Administrador' : 'Cliente' ?> ·
       Miembro desde: <?= e(date('d/m/Y', strtotime($u['fecha_registro']))) ?></p>
    <form method="post">
      <label>Nombre<input type="text" name="nombre" value="<?= e($u['nombre']) ?>"></label>
      <label>Talla preferida
        <select name="talla">
          <option value="">Sin definir</option>
          <?php foreach (['XS','S','M','L','XL','XXL'] as $t): ?>
            <option value="<?= $t ?>" <?= $u['talla_preferida'] === $t ? 'selected' : '' ?>><?= $t ?></option>
          <?php endforeach; ?>
        </select>
      </label>
      <button class="btn" type="submit">Guardar perfil</button>
    </form>
  </section>

  <section class="panel">
    <h2>Historial de pruebas (<?= count($historial) ?>)</h2>
    <?php if (!$historial): ?>
      <p class="gris">Todavía no te has probado nada. Ve al catálogo y toca "Probar".</p>
    <?php else: ?>
      <table class="tabla">
        <tr><th>Prenda</th><th>Categoría</th><th>Tienda</th><th>Fecha</th></tr>
        <?php foreach ($historial as $h): ?>
          <tr>
            <td><?= e($h['prenda'] ?: 'Prenda eliminada') ?></td>
            <td><?= e($h['categoria']) ?></td>
            <td><?= e($h['tienda'] ?: '—') ?></td>
            <td><?= e(date('d/m/Y H:i', strtotime($h['fecha']))) ?></td>
          </tr>
        <?php endforeach; ?>
      </table>
    <?php endif; ?>
  </section>
</div>
<?php require_once __DIR__ . '/includes/footer.php'; ?>
