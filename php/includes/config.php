<?php
// =====================================================================
//  V-TryOn Studio · Configuración general (XAMPP)
//  Cambia aquí el usuario y la contraseña de MySQL si los tuyos son otros.
// =====================================================================
declare(strict_types=1);

const DB_HOST = 'localhost';
const DB_NOMBRE = 'vtryon_studio';
const DB_USUARIO = 'root';
const DB_CLAVE = '';

// Carpeta donde se guardan las imágenes de las prendas
const CARPETA_UPLOADS = __DIR__ . '/../uploads/';

session_start();

/** Conexión única a la base de datos */
function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NOMBRE . ';charset=utf8mb4';
        try {
            $pdo = new PDO($dsn, DB_USUARIO, DB_CLAVE, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
        } catch (PDOException $e) {
            die('<p style="font-family:sans-serif;padding:20px">No se pudo conectar con MySQL. '
                . 'Revisa que XAMPP esté encendido y que hayas importado <b>database/vtryon_db.sql</b>.<br><br>'
                . 'Detalle: ' . htmlspecialchars($e->getMessage()) . '</p>');
        }
    }
    return $pdo;
}

/** Escape corto para imprimir en HTML */
function e(?string $texto): string
{
    return htmlspecialchars((string) $texto, ENT_QUOTES, 'UTF-8');
}

function usuarioActual(): ?array
{
    return $_SESSION['usuario'] ?? null;
}

function esAdmin(): bool
{
    $u = usuarioActual();
    return $u !== null && (int) $u['rol_id'] === 1;
}

/** Corta la ejecución si no hay sesión de administrador */
function exigirAdmin(): void
{
    if (!esAdmin()) {
        header('Location: ' . urlBase() . 'login.php?redirigir=admin');
        exit;
    }
}

function exigirSesion(): void
{
    if (usuarioActual() === null) {
        header('Location: ' . urlBase() . 'login.php');
        exit;
    }
}

/** Ruta base del sitio, sirve igual desde /admin que desde la raíz */
function urlBase(): string
{
    $enAdmin = str_contains(str_replace('\\', '/', $_SERVER['SCRIPT_NAME'] ?? ''), '/admin/');
    return $enAdmin ? '../' : '';
}

function ajustes(): array
{
    static $cache = null;
    if ($cache === null) {
        $cache = db()->query('SELECT * FROM ajustes WHERE id = 1')->fetch() ?: [
            'nombre_sitio' => 'V-TryOn Studio',
            'eslogan' => 'Probador virtual para tiendas locales',
            'permitir_registro' => 1,
            'mostrar_precios' => 1,
            'ajuste_auto_defecto' => 1,
            'quitar_fondo_defecto' => 1,
        ];
    }
    return $cache;
}

function categorias(): array
{
    static $cache = null;
    if ($cache === null) {
        $cache = db()->query('SELECT * FROM categorias ORDER BY id')->fetchAll();
    }
    return $cache;
}

function tiendas(bool $soloActivas = false): array
{
    $sql = 'SELECT * FROM tiendas' . ($soloActivas ? ' WHERE activa = 1' : '') . ' ORDER BY nombre';
    return db()->query($sql)->fetchAll();
}

function mensaje(string $texto = null): ?string
{
    if ($texto !== null) {
        $_SESSION['mensaje'] = $texto;
        return null;
    }
    $m = $_SESSION['mensaje'] ?? null;
    unset($_SESSION['mensaje']);
    return $m;
}

function dinero($valor): string
{
    return '$' . number_format((float) $valor, 2);
}

/**
 * Guarda la imagen subida de una prenda y devuelve el nombre del archivo.
 * Acepta jpg, png y webp de hasta 4 MB.
 */
function guardarImagen(array $archivo): ?string
{
    if (!isset($archivo['tmp_name']) || $archivo['error'] !== UPLOAD_ERR_OK) {
        return null;
    }
    if ($archivo['size'] > 4 * 1024 * 1024) {
        throw new RuntimeException('La imagen pesa más de 4 MB.');
    }
    $tipo = @getimagesize($archivo['tmp_name']);
    $permitidos = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    if ($tipo === false || !isset($permitidos[$tipo['mime']])) {
        throw new RuntimeException('El archivo no es una imagen válida (usa jpg, png o webp).');
    }
    if (!is_dir(CARPETA_UPLOADS)) {
        mkdir(CARPETA_UPLOADS, 0775, true);
    }
    $nombre = 'prenda_' . date('Ymd_His') . '_' . bin2hex(random_bytes(3)) . '.' . $permitidos[$tipo['mime']];
    if (!move_uploaded_file($archivo['tmp_name'], CARPETA_UPLOADS . $nombre)) {
        throw new RuntimeException('No se pudo guardar la imagen en la carpeta uploads.');
    }
    return $nombre;
}
