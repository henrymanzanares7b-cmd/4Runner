<?php
require_once __DIR__ . '/includes/config.php';
$error = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $correo = trim($_POST['correo'] ?? '');
    $clave = $_POST['clave'] ?? '';
    $stmt = db()->prepare('SELECT * FROM usuarios WHERE correo = :c LIMIT 1');
    $stmt->execute([':c' => $correo]);
    $usuario = $stmt->fetch();

    if ($usuario && password_verify($clave, $usuario['password_hash'])) {
        unset($usuario['password_hash']);
        $_SESSION['usuario'] = $usuario;
        db()->prepare('UPDATE usuarios SET ultimo_ingreso = NOW() WHERE id = :id')->execute([':id' => $usuario['id']]);
        mensaje('¡Bienvenido, ' . $usuario['nombre'] . '!');
        header('Location: ' . ((int) $usuario['rol_id'] === 1 ? 'admin/index.php' : 'index.php'));
        exit;
    }
    $error = 'Correo o contraseña incorrectos.';
}

$titulo = 'Ingresar';
require_once __DIR__ . '/includes/header.php';
?>
<div class="caja-form">
  <h1>Iniciar sesión</h1>
  <?php if ($error): ?><p class="error"><?= e($error) ?></p><?php endif; ?>
  <form method="post">
    <label>Correo electrónico
      <input type="email" name="correo" required placeholder="tu@correo.com">
    </label>
    <label>Contraseña
      <input type="password" name="clave" required>
    </label>
    <button class="btn grande ancho" type="submit">Ingresar</button>
  </form>
  <?php if ((int) ajustes()['permitir_registro'] === 1): ?>
    <p class="mini">¿No tienes cuenta? <a href="registro.php">Regístrate aquí</a>.</p>
  <?php endif; ?>
  <p class="mini gris">Cuentas de ejemplo: admin@vtryon.com y cliente@correo.com (contraseña 123456).</p>
</div>
<?php require_once __DIR__ . '/includes/footer.php'; ?>
