<?php
// Registra una prueba virtual (alimenta el reporte de productos más probados)
require_once __DIR__ . '/../includes/config.php';
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Método no permitido']);
    exit;
}

$prendaId = isset($_POST['prenda_id']) ? (int) $_POST['prenda_id'] : 0;
if ($prendaId <= 0) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Falta la prenda']);
    exit;
}

$stmt = db()->prepare('SELECT id, tienda_id, categoria_id FROM prendas WHERE id = :id');
$stmt->execute([':id' => $prendaId]);
$prenda = $stmt->fetch();
if (!$prenda) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'La prenda no existe']);
    exit;
}

$usuario = usuarioActual();

// El método llega del probador; si no viene o viene raro, se guarda 'auto'.
$metodo = $_POST['metodo'] ?? 'auto';
if (!in_array($metodo, ['auto', 'manual', 'ia'], true)) {
    $metodo = 'auto';
}

try {
    $ins = db()->prepare(
        'INSERT INTO pruebas (usuario_id, prenda_id, tienda_id, categoria_id, metodo)
         VALUES (:u, :p, :t, :c, :m)'
    );
    $ins->execute([
        ':u' => $usuario['id'] ?? null,
        ':p' => $prenda['id'],
        ':t' => $prenda['tienda_id'],
        ':c' => $prenda['categoria_id'],
        ':m' => $metodo,
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'No se pudo guardar la prueba: ' . $e->getMessage()]);
    exit;
}

echo json_encode(['ok' => true, 'id' => (int) db()->lastInsertId()]);
