# V-TryOn Studio · Versión PHP + MySQL (XAMPP)

Probador virtual de ropa para tiendas locales. Misma lógica del probador que la versión publicada en Firebase, pero con backend PHP y base de datos MySQL, como pide el documento del proyecto.

## Instalación (5 pasos)

1. Copia la carpeta `vtryon-php` dentro de `C:\xampp\htdocs\`.
2. Abre XAMPP y enciende **Apache** y **MySQL**.
3. Entra a `http://localhost/phpmyadmin`, pestaña **Importar**, y sube `database/vtryon_db.sql`. Eso crea la base `vtryon_studio` con tiendas, categorías y 10 prendas de ejemplo.
4. Si tu MySQL tiene contraseña, cámbiala en `includes/config.php` (constantes `DB_USUARIO` y `DB_CLAVE`).
5. Abre `http://localhost/vtryon-php/`.

## Cuentas de ejemplo

| Correo | Contraseña | Rol |
|---|---|---|
| admin@vtryon.com | 123456 | Administrador |
| cliente@correo.com | 123456 | Cliente |

Cambia esas contraseñas antes de presentar: entra a phpMyAdmin o crea cuentas nuevas desde `registro.php`.

## Qué hace cada parte

| Archivo | Para qué sirve |
|---|---|
| `index.php` | Lista de tiendas registradas (catálogo público de tiendas) |
| `catalogo.php` | Catálogo con filtros por tienda, categoría y búsqueda |
| `probador.php` | Probador virtual: foto, cámara con silueta guía, maniquí, conjunto de prendas y **catálogo completo con filtros dentro de la misma vista** |
| `login.php`, `registro.php`, `perfil.php` | Sesión de clientes y administradores |
| `admin/index.php` | Resumen con métricas y top 5 de prendas |
| `admin/tiendas.php` | Registrar, editar, ocultar y eliminar tiendas |
| `admin/prendas.php` | Catálogo completo: agregar, editar, ocultar y eliminar prendas |
| `admin/usuarios.php` | Lista de usuarios y cambio de rol |
| `admin/reporte.php` | Reporte de productos más probados, por tienda y por categoría |
| `api/prueba.php` | Guarda cada prueba virtual (alimenta el reporte) |
| `assets/motor.js` | Motor del probador (silueta, ajuste, zapatos, luz y sombras) |
| `assets/pose.js` | Detección del cuerpo con MediaPipe |
| `assets/probador.js` | Interfaz del probador |

## Novedad de esta versión (malla TPS)

Las prendas de torso (camisas y vestidos) ya no se deforman estirando cada fila
por separado. Ahora se usa una malla 2D deformada con **Thin Plate Spline**, con
puntos de control tomados de los landmarks de MediaPipe (hombros, axilas, pecho,
cintura y caderas). La tela sigue las curvas del cuerpo, el dobladillo se curva y
se le añade un sombreado de volumen para que no se vea plana.

Está en `assets/motor.js`: `buildTPS`, `drawWarpedMesh`, `bodyAnchors`,
`warpGarmentToBody` y `shadeGarmentVolume`. Si en alguna foto no se ven
suficientes puntos del cuerpo, se vuelve solo al método anterior.
Para desactivarla: `window.VTRYON_SIN_MALLA = true` en la consola del navegador.

## Novedad anterior

El catálogo completo ahora vive dentro de la vista del probador (`probador.php`). Desde ahí se puede filtrar por tienda, por categoría y buscar por nombre o color, todo al instante y sin recargar la página. Las prendas que ya están puestas se marcan en verde y el mismo botón sirve para quitarlas.

## Notas

- La cámara solo funciona en `localhost` o con https; los navegadores lo exigen.
- La detección del cuerpo (MediaPipe) se descarga de internet la primera vez, así que necesita conexión.
- Necesita PHP 8 o superior (el XAMPP actual ya lo trae).
- Las imágenes de las prendas se guardan en `uploads/`. Esa carpeta debe tener permisos de escritura.
