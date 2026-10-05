<?php
require_once __DIR__ . '/../includes/config.php';
exigirAdmin();
$u = usuarioActual();
$error = null;

// Guardar prenda (crear o editar)
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['accion'] ?? '') === 'guardar') {
    try {
        $id = (int) ($_POST['id'] ?? 0);
        $imagen = guardarImagen($_FILES['imagen'] ?? []);
        $datos = [
            ':nombre' => trim($_POST['nombre'] ?? ''),
            ':tienda' => (int) ($_POST['tienda_id'] ?? 0) ?: null,
            ':categoria' => (int) ($_POST['categoria_id'] ?? 1),
            ':color' => trim($_POST['color'] ?? '') ?: 'Varios',
            ':precio' => (float) ($_POST['precio'] ?? 0),
            ':tallas' => trim($_POST['tallas'] ?? ''),
            ':existencias' => (int) ($_POST['existencias'] ?? 0),
            ':activa' => isset($_POST['activa']) ? 1 : 0,
        ];
        if ($datos[':nombre'] === '') {
            throw new RuntimeException('La prenda necesita un nombre.');
        }
        if ($id > 0) {
            $sql = 'UPDATE prendas SET nombre=:nombre, tienda_id=:tienda, categoria_id=:categoria, color=:color,
                    precio=:precio, tallas=:tallas, existencias=:existencias, activa=:activa'
                . ($imagen ? ', imagen=:imagen' : '') . ' WHERE id=:id';
            $datos[':id'] = $id;
            if ($imagen) $datos[':imagen'] = $imagen;
            db()->prepare($sql)->execute($datos);
            mensaje('Prenda actualizada.');
        } else {
            if (!$imagen) throw new RuntimeException('Sube la imagen de la prenda.');
            $datos[':imagen'] = $imagen;
            $datos[':creador'] = $u['id'];
            db()->prepare(
                'INSERT INTO prendas (nombre, tienda_id, categoria_id, color, precio, tallas, existencias, activa, imagen, creado_por)
                 VALUES (:nombre, :tienda, :categoria, :color, :precio, :tallas, :existencias, :activa, :imagen, :creador)'
            )->execute($datos);
            mensaje('Prenda agregada al catálogo.');
        }
        header('Location: prendas.php');
        exit;
    } catch (RuntimeException $ex) {
        $error = $ex->getMessage();
    }
}

// Eliminar / cambiar visibilidad
if (isset($_GET['eliminar'])) {
    db()->prepare('DELETE FROM prendas WHERE id = :id')->execute([':id' => (int) $_GET['eliminar']]);
    mensaje('Prenda eliminada.');
    header('Location: prendas.php');
    exit;
}
if (isset($_GET['visibilidad'])) {
    db()->prepare('UPDATE prendas SET activa = NOT activa WHERE id = :id')->execute([':id' => (int) $_GET['visibilidad']]);
    header('Location: prendas.php');
    exit;
}

$editar = null;
if (isset($_GET['editar'])) {
    $stmt = db()->prepare('SELECT * FROM prendas WHERE id = :id');
    $stmt->execute([':id' => (int) $_GET['editar']]);
    $editar = $stmt->fetch() ?: null;
}

$lista = db()->query(
    'SELECT p.*, c.nombre AS categoria, t.nombre AS tienda
     FROM prendas p
     JOIN categorias c ON c.id = p.categoria_id
     LEFT JOIN tiendas t ON t.id = p.tienda_id
     ORDER BY p.fecha_creacion DESC'
)->fetchAll();

$titulo = 'Catálogo';
require_once __DIR__ . '/../includes/header.php';
?>
<h1>Catálogo</h1>
<nav class="sub-menu">
  <a href="index.php">Resumen</a>
  <a href="tiendas.php">Tiendas</a>
  <a class="activo" href="prendas.php">Catálogo</a>
  <a href="usuarios.php">Usuarios</a>
  <a href="reporte.php">Reporte</a>
</nav>

<section class="panel">
  <h2><?= $editar ? 'Editar prenda' : 'Agregar prenda' ?></h2>
  <?php if ($error): ?><p class="error"><?= e($error) ?></p><?php endif; ?>
  <form method="post" enctype="multipart/form-data" class="form-linea">
    <input type="hidden" name="accion" value="guardar">
    <input type="hidden" name="id" value="<?= (int) ($editar['id'] ?? 0) ?>">
    <label>Nombre<input type="text" name="nombre" required value="<?= e($editar['nombre'] ?? '') ?>"></label>
    <label>Tienda
      <select name="tienda_id">
        <option value="0">Sin tienda</option>
        <?php foreach (tiendas() as $t): ?>
          <option value="<?= (int) $t['id'] ?>" <?= (int) ($editar['tienda_id'] ?? 0) === (int) $t['id'] ? 'selected' : '' ?>><?= e($t['nombre']) ?></option>
        <?php endforeach; ?>
      </select>
    </label>
    <label>Categoría
      <select name="categoria_id">
        <?php foreach (categorias() as $c): ?>
          <option value="<?= (int) $c['id'] ?>" <?= (int) ($editar['categoria_id'] ?? 1) === (int) $c['id'] ? 'selected' : '' ?>><?= e($c['nombre']) ?></option>
        <?php endforeach; ?>
      </select>
    </label>
    <label>Color<input type="text" name="color" value="<?= e($editar['color'] ?? '') ?>"></label>
    <label>Precio<input type="number" step="0.01" min="0" name="precio" value="<?= e((string) ($editar['precio'] ?? '0.00')) ?>"></label>
    <label>Tallas<input type="text" name="tallas" value="<?= e($editar['tallas'] ?? 'S, M, L') ?>"></label>
    <label>Existencias<input type="number" min="0" name="existencias" value="<?= (int) ($editar['existencias'] ?? 0) ?>"></label>
    <label>Imagen<input type="file" name="imagen" accept="image/*" <?= $editar ? '' : 'required' ?>></label>
    <label class="inline"><input type="checkbox" name="activa" <?= !$editar || (int) $editar['activa'] === 1 ? 'checked' : '' ?>> Visible en el catálogo</label>
    <button class="btn" type="submit"><?= $editar ? 'Guardar cambios' : 'Agregar al catálogo' ?></button>
    <?php if ($editar): ?><a class="btn secundario" href="prendas.php">Cancelar</a><?php endif; ?>
  </form>
  <p class="mini">Funciona mejor con la prenda sola sobre fondo liso (blanco o de un color).</p>
</section>

<section class="panel">
  <table class="tabla">
    <tr><th>Imagen</th><th>Prenda</th><th>Categoría</th><th>Tienda</th><th>Precio</th><th>Tallas</th><th>Existencias</th><th>Visible</th><th>Acciones</th></tr>
    <?php foreach ($lista as $p): ?>
      <tr>
        <td><img class="miniatura" src="../uploads/<?= e($p['imagen']) ?>" alt=""></td>
        <td><strong><?= e($p['nombre']) ?></strong><br><span class="mini"><?= e($p['color']) ?></span></td>
        <td><?= e($p['categoria']) ?></td>
        <td><?= e($p['tienda'] ?: 'Sin tienda') ?></td>
        <td><?= dinero($p['precio']) ?></td>
        <td><?= e($p['tallas'] ?: '—') ?></td>
        <td class="<?= (int) $p['existencias'] === 0 ? 'sin-stock' : '' ?>"><?= (int) $p['existencias'] ?></td>
        <td><a class="btn mini-btn" href="prendas.php?visibilidad=<?= (int) $p['id'] ?>"><?= (int) $p['activa'] === 1 ? 'Sí' : 'No' ?></a></td>
        <td class="acciones">
          <a class="btn mini-btn" href="prendas.php?editar=<?= (int) $p['id'] ?>">Editar</a>
          <a class="btn mini-btn peligro" href="prendas.php?eliminar=<?= (int) $p['id'] ?>" onclick="return confirm('¿Eliminar <?= e($p['nombre']) ?> del catálogo?')">Eliminar</a>
        </td>
      </tr>
    <?php endforeach; ?>
  </table>
</section>
<?php require_once __DIR__ . '/../includes/footer.php'; ?>
