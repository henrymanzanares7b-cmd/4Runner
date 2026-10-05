<?php
require_once __DIR__ . '/includes/config.php';
$error = null;

if ((int) ajustes()['permitir_registro'] !== 1) {
    mensaje('Los registros están cerrados por el administrador.');
    header('Location: login.php');
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $nombre = trim($_POST['nombre'] ?? '');
    $correo = trim($_POST['correo'] ?? '');
    $clave = $_POST['clave'] ?? '';

    if ($nombre === '' || !filter_var($correo, FILTER_VALIDATE_EMAIL)) {
        $error = 'Escribe tu nombre y un correo válido.';
    } elseif (strlen($clave) < 6) {
        $error = 'La contraseña necesita al menos 6 caracteres.';
    } else {
        $existe = db()->prepare('SELECT id FROM usuarios WHERE correo = :c');
        $existe->execute([':c' => $correo]);
        if ($existe->fetch()) {
            $error = 'Ese correo ya tiene una cuenta.';
        } else {
            $stmt = db()->prepare('INSERT INTO usuarios (nombre, correo, password_hash, rol_id) VALUES (:n, :c, :p, 2)');
            $stmt->execute([':n' => $nombre, ':c' => $correo, ':p' => password_hash($clave, PASSWORD_DEFAULT)]);
            mensaje('Cuenta creada. Ya puedes iniciar sesión.');
            header('Location: login.php');
            exit;
        }
    }
}

$titulo = 'Crear cuenta';
require_once __DIR__ . '/includes/header.php';
?>
<div class="caja-form">
  <h1>Crear cuenta</h1>
  <?php if ($error): ?><p class="error"><?= e($error) ?></p><?php endif; ?>
  <form method="post">
    <label>Tu nombre<input type="text" name="nombre" required></label>
    <label>Correo electrónico<input type="email" name="correo" required></label>
    <label>Contraseña<input type="password" name="clave" required minlength="6"></label>
    <button class="btn grande ancho" type="submit">Crear mi cuenta</button>
  </form>
  <p class="mini">¿Ya tienes cuenta? <a href="login.php">Inicia sesión</a>.</p>
</div>
<?php require_once __DIR__ . '/includes/footer.php'; ?>
