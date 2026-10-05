<?php
require_once __DIR__ . '/../includes/config.php';
exigirAdmin();
$u = usuarioActual();

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['accion'] ?? '') === 'rol') {
    $id = (int) $_POST['id'];
    $rol = (int) $_POST['rol_id'] === 1 ? 1 : 2;
    if ($id !== (int) $u['id']) {
        db()->prepare('UPDATE usuarios SET rol_id = :r WHERE id = :id')->execute([':r' => $rol, ':id' => $id]);
        mensaje('Rol actualizado.');
    } else {
        mensaje('No puedes cambiar tu propio rol.');
    }
    header('Location: usuarios.php');
    exit;
}

$lista = db()->query(
    'SELECT us.*, r.nombre AS rol, t.nombre AS tienda, COUNT(p.id) AS pruebas
     FROM usuarios us
     JOIN roles r ON r.id = us.rol_id
     LEFT JOIN tiendas t ON t.id = us.tienda_id
     LEFT JOIN pruebas p ON p.usuario_id = us.id
     GROUP BY us.id ORDER BY us.fecha_registro'
)->fetchAll();

$titulo = 'Usuarios';
require_once __DIR__ . '/../includes/header.php';
?>
<h1>Usuarios</h1>
<nav class="sub-menu">
  <a href="index.php">Resumen</a>
  <a href="tiendas.php">Tiendas</a>
  <a href="prendas.php">Catálogo</a>
  <a class="activo" href="usuarios.php">Usuarios</a>
  <a href="reporte.php">Reporte</a>
</nav>

<section class="panel">
  <table class="tabla">
    <tr><th>Correo</th><th>Nombre</th><th>Rol</th><th>Pruebas</th><th>Registrado</th><th>Último ingreso</th></tr>
    <?php foreach ($lista as $x): ?>
      <tr>
        <td><?= e($x['correo']) ?><?= (int) $x['id'] === (int) $u['id'] ? ' <span class="mini">(tú)</span>' : '' ?></td>
        <td><?= e($x['nombre']) ?></td>
        <td>
          <form method="post" class="inline-form">
            <input type="hidden" name="accion" value="rol">
            <input type="hidden" name="id" value="<?= (int) $x['id'] ?>">
            <select name="rol_id" onchange="this.form.submit()" <?= (int) $x['id'] === (int) $u['id'] ? 'disabled' : '' ?>>
              <option value="2" <?= (int) $x['rol_id'] === 2 ? 'selected' : '' ?>>Cliente</option>
              <option value="1" <?= (int) $x['rol_id'] === 1 ? 'selected' : '' ?>>Administrador</option>
            </select>
          </form>
        </td>
        <td><?= (int) $x['pruebas'] ?></td>
        <td><?= e(date('d/m/Y', strtotime($x['fecha_registro']))) ?></td>
        <td><?= $x['ultimo_ingreso'] ? e(date('d/m/Y H:i', strtotime($x['ultimo_ingreso']))) : '—' ?></td>
      </tr>
    <?php endforeach; ?>
  </table>
</section>
<?php require_once __DIR__ . '/../includes/footer.php'; ?>
