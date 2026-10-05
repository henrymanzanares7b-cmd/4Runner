<?php
require_once __DIR__ . '/../includes/config.php';
exigirAdmin();

// Guardar (crear o editar)
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['accion'] ?? '') === 'guardar') {
    $id = (int) ($_POST['id'] ?? 0);
    $datos = [
        ':nombre' => trim($_POST['nombre'] ?? ''),
        ':descripcion' => trim($_POST['descripcion'] ?? ''),
        ':encargado' => trim($_POST['encargado'] ?? ''),
        ':telefono' => trim($_POST['telefono'] ?? ''),
        ':activa' => isset($_POST['activa']) ? 1 : 0,
    ];
    if ($datos[':nombre'] === '') {
        mensaje('La tienda necesita un nombre.');
    } elseif ($id > 0) {
        $datos[':id'] = $id;
        db()->prepare('UPDATE tiendas SET nombre=:nombre, descripcion=:descripcion, encargado=:encargado, telefono=:telefono, activa=:activa WHERE id=:id')->execute($datos);
        mensaje('Tienda actualizada.');
    } else {
        db()->prepare('INSERT INTO tiendas (nombre, descripcion, encargado, telefono, activa) VALUES (:nombre, :descripcion, :encargado, :telefono, :activa)')->execute($datos);
        mensaje('Tienda registrada.');
    }
    header('Location: tiendas.php');
    exit;
}

// Eliminar
if (isset($_GET['eliminar'])) {
    db()->prepare('DELETE FROM tiendas WHERE id = :id')->execute([':id' => (int) $_GET['eliminar']]);
    mensaje('Tienda eliminada. Sus prendas quedaron sin tienda asignada.');
    header('Location: tiendas.php');
    exit;
}

$editar = null;
if (isset($_GET['editar'])) {
    $stmt = db()->prepare('SELECT * FROM tiendas WHERE id = :id');
    $stmt->execute([':id' => (int) $_GET['editar']]);
    $editar = $stmt->fetch() ?: null;
}

$lista = db()->query(
    'SELECT t.*, COUNT(DISTINCT p.id) AS prendas, COUNT(pr.id) AS pruebas
     FROM tiendas t
     LEFT JOIN prendas p ON p.tienda_id = t.id
     LEFT JOIN pruebas pr ON pr.tienda_id = t.id
     GROUP BY t.id ORDER BY t.nombre'
)->fetchAll();

$titulo = 'Tiendas';
require_once __DIR__ . '/../includes/header.php';
?>
<h1>Tiendas</h1>
<nav class="sub-menu">
  <a href="index.php">Resumen</a>
  <a class="activo" href="tiendas.php">Tiendas</a>
  <a href="prendas.php">Catálogo</a>
  <a href="usuarios.php">Usuarios</a>
  <a href="reporte.php">Reporte</a>
</nav>

<section class="panel">
  <h2><?= $editar ? 'Editar tienda' : 'Registrar tienda' ?></h2>
  <form method="post" class="form-linea">
    <input type="hidden" name="accion" value="guardar">
    <input type="hidden" name="id" value="<?= (int) ($editar['id'] ?? 0) ?>">
    <label>Nombre<input type="text" name="nombre" required value="<?= e($editar['nombre'] ?? '') ?>"></label>
    <label>Descripción<input type="text" name="descripcion" value="<?= e($editar['descripcion'] ?? '') ?>"></label>
    <label>Encargado<input type="text" name="encargado" value="<?= e($editar['encargado'] ?? '') ?>"></label>
    <label>Teléfono<input type="text" name="telefono" value="<?= e($editar['telefono'] ?? '') ?>"></label>
    <label class="inline"><input type="checkbox" name="activa" <?= !$editar || (int) $editar['activa'] === 1 ? 'checked' : '' ?>> Visible</label>
    <button class="btn" type="submit"><?= $editar ? 'Guardar cambios' : 'Registrar tienda' ?></button>
    <?php if ($editar): ?><a class="btn secundario" href="tiendas.php">Cancelar</a><?php endif; ?>
  </form>
</section>

<section class="panel">
  <table class="tabla">
    <tr><th>Tienda</th><th>Encargado</th><th>Teléfono</th><th>Prendas</th><th>Pruebas</th><th>Visible</th><th>Acciones</th></tr>
    <?php foreach ($lista as $t): ?>
      <tr>
        <td><strong><?= e($t['nombre']) ?></strong><br><span class="mini"><?= e($t['descripcion']) ?></span></td>
        <td><?= e($t['encargado'] ?: '—') ?></td>
        <td><?= e($t['telefono'] ?: '—') ?></td>
        <td><?= (int) $t['prendas'] ?></td>
        <td><?= (int) $t['pruebas'] ?></td>
        <td><?= (int) $t['activa'] === 1 ? 'Sí' : 'No' ?></td>
        <td class="acciones">
          <a class="btn mini-btn" href="tiendas.php?editar=<?= (int) $t['id'] ?>">Editar</a>
          <a class="btn mini-btn peligro" href="tiendas.php?eliminar=<?= (int) $t['id'] ?>" onclick="return confirm('¿Eliminar la tienda <?= e($t['nombre']) ?>? Sus prendas quedarán sin tienda.')">Eliminar</a>
        </td>
      </tr>
    <?php endforeach; ?>
  </table>
  <?php if (!$lista): ?><p class="gris">Todavía no hay tiendas.</p><?php endif; ?>
</section>
<?php require_once __DIR__ . '/../includes/footer.php'; ?>
