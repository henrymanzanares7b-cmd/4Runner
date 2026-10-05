-- =====================================================================
--  V-TryOn Studio · Base de datos (MySQL 8 / MariaDB · XAMPP)
--  Versión PHP: incluye tiendas y el reporte de productos más probados.
--  Importar desde phpMyAdmin o con:  mysql -u root < vtryon_db.sql
-- =====================================================================

DROP DATABASE IF EXISTS vtryon_studio;
CREATE DATABASE vtryon_studio CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE vtryon_studio;

-- ---------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------
CREATE TABLE roles (
  id          TINYINT UNSIGNED PRIMARY KEY,
  clave       VARCHAR(20)  NOT NULL UNIQUE,   -- 'admin' | 'user'
  nombre      VARCHAR(40)  NOT NULL,
  descripcion VARCHAR(200)
);

-- ---------------------------------------------------------------------
-- Tiendas locales (cada una con su propio catálogo)
-- ---------------------------------------------------------------------
CREATE TABLE tiendas (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre         VARCHAR(100) NOT NULL UNIQUE,
  descripcion    VARCHAR(200),
  encargado      VARCHAR(100),
  telefono       VARCHAR(30),
  activa         BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- Usuarios: administradores de tienda y clientes
-- ---------------------------------------------------------------------
CREATE TABLE usuarios (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre          VARCHAR(100) NOT NULL,
  correo          VARCHAR(160) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,          -- password_hash() de PHP
  rol_id          TINYINT UNSIGNED NOT NULL DEFAULT 2,
  tienda_id       INT UNSIGNED NULL,              -- tienda que administra (solo admin)
  talla_preferida ENUM('XS','S','M','L','XL','XXL') NULL,
  fecha_registro  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultimo_ingreso  DATETIME NULL,
  CONSTRAINT fk_usuarios_rol    FOREIGN KEY (rol_id)    REFERENCES roles(id),
  CONSTRAINT fk_usuarios_tienda FOREIGN KEY (tienda_id) REFERENCES tiendas(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------
-- Categorías (definen dónde se coloca la prenda en el cuerpo)
-- ---------------------------------------------------------------------
CREATE TABLE categorias (
  id          TINYINT UNSIGNED PRIMARY KEY,
  clave       VARCHAR(10) NOT NULL UNIQUE,   -- top | bottom | head | shoes | full
  nombre      VARCHAR(40) NOT NULL,
  zona_cuerpo VARCHAR(60) NOT NULL
);

-- ---------------------------------------------------------------------
-- Productos del catálogo
-- ---------------------------------------------------------------------
CREATE TABLE prendas (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tienda_id           INT UNSIGNED NULL,
  nombre              VARCHAR(120) NOT NULL,
  categoria_id        TINYINT UNSIGNED NOT NULL,
  color               VARCHAR(40)  NOT NULL DEFAULT 'Varios',
  precio              DECIMAL(8,2) NOT NULL DEFAULT 0.00,
  tallas              VARCHAR(40)  NULL,
  existencias         INT UNSIGNED NOT NULL DEFAULT 0,
  imagen              VARCHAR(255) NOT NULL,        -- archivo en /uploads
  activa              BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_por          INT UNSIGNED NULL,
  fecha_creacion      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_prendas_tienda    FOREIGN KEY (tienda_id)    REFERENCES tiendas(id)   ON DELETE SET NULL,
  CONSTRAINT fk_prendas_categoria FOREIGN KEY (categoria_id) REFERENCES categorias(id),
  CONSTRAINT fk_prendas_creador   FOREIGN KEY (creado_por)   REFERENCES usuarios(id)  ON DELETE SET NULL,
  CONSTRAINT chk_prendas_precio   CHECK (precio >= 0)
);
CREATE INDEX idx_prendas_tienda    ON prendas(tienda_id, activa);
CREATE INDEX idx_prendas_categoria ON prendas(categoria_id, activa);

-- ---------------------------------------------------------------------
-- Pruebas virtuales (alimentan el reporte de productos más probados)
-- ---------------------------------------------------------------------
CREATE TABLE pruebas (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id   INT UNSIGNED NULL,                      -- NULL si el cliente no inició sesión
  prenda_id    INT UNSIGNED NULL,
  tienda_id    INT UNSIGNED NULL,
  categoria_id TINYINT UNSIGNED NOT NULL,
  metodo       ENUM('auto','manual','ia') NOT NULL DEFAULT 'auto',
  fecha        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pruebas_usuario   FOREIGN KEY (usuario_id)   REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_pruebas_prenda    FOREIGN KEY (prenda_id)    REFERENCES prendas(id)  ON DELETE SET NULL,
  CONSTRAINT fk_pruebas_tienda    FOREIGN KEY (tienda_id)    REFERENCES tiendas(id)  ON DELETE SET NULL,
  CONSTRAINT fk_pruebas_categoria FOREIGN KEY (categoria_id) REFERENCES categorias(id)
);
CREATE INDEX idx_pruebas_prenda ON pruebas(prenda_id, fecha);
CREATE INDEX idx_pruebas_tienda ON pruebas(tienda_id, fecha);

-- ---------------------------------------------------------------------
-- Ajustes generales (una sola fila)
-- ---------------------------------------------------------------------
CREATE TABLE ajustes (
  id                   TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
  nombre_sitio         VARCHAR(80)  NOT NULL,
  eslogan              VARCHAR(160),
  permitir_registro    BOOLEAN NOT NULL DEFAULT TRUE,
  mostrar_precios      BOOLEAN NOT NULL DEFAULT TRUE,
  ajuste_auto_defecto  BOOLEAN NOT NULL DEFAULT TRUE,
  quitar_fondo_defecto BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_actualizacion  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_ajustes_unica CHECK (id = 1)
);

-- =====================================================================
--  Datos iniciales
-- =====================================================================
INSERT INTO roles (id, clave, nombre, descripcion) VALUES
  (1, 'admin', 'Administrador', 'Gestiona tiendas, catálogo, usuarios y reportes'),
  (2, 'user',  'Cliente',       'Usa el probador virtual y administra su perfil');

INSERT INTO categorias (id, clave, nombre, zona_cuerpo) VALUES
  (1, 'top',    'Camisas',    'Hombros y cadera'),
  (2, 'bottom', 'Pantalones', 'Cadera, rodillas y tobillos'),
  (3, 'head',   'Gorras',     'Ojos y orejas'),
  (4, 'shoes',  'Zapatos',    'Tobillos, talones y puntas'),
  (5, 'full',   'Vestidos',   'Hombros y rodillas');

INSERT INTO tiendas (id, nombre, descripcion, encargado, telefono) VALUES
  (1, 'Boutique La Esquina', 'Ropa casual para jóvenes', 'Luis Martínez', '2222-1111'),
  (2, 'Estilo Urbano SV',    'Streetwear y accesorios',  'Henry Gómez',   '2222-2222');

-- Contraseña de las dos cuentas de ejemplo: 123456
INSERT INTO usuarios (nombre, correo, password_hash, rol_id, tienda_id) VALUES
  ('Administrador', 'admin@vtryon.com',  '$2y$12$y756nHBHivSTn7VZSJyxi.vo3DHwyNZ8EVZT5ySZFWkT83ZiUO07.', 1, 1),
  ('Cliente Demo',  'cliente@correo.com','$2y$12$y756nHBHivSTn7VZSJyxi.vo3DHwyNZ8EVZT5ySZFWkT83ZiUO07.', 2, NULL);

INSERT INTO prendas (tienda_id, nombre, categoria_id, color, precio, tallas, existencias, imagen, creado_por) VALUES
  (1, 'Camiseta Minimalista Negra', 1, 'Negro',      24.99, 'S, M, L',        12, 'camiseta_negra.png',    1),
  (1, 'Camisa Denim Casual',        1, 'Azul',       34.99, 'S, M, L, XL',     8, 'camisa_denim.png',      1),
  (2, 'Sudadera Urban Oversize',    1, 'Gris',       42.99, 'M, L, XL',        5, 'sudadera_gris.png',     1),
  (1, 'Jeans Slim Fit Azul',        2, 'Azul',       39.99, '28, 30, 32, 34', 15, 'jeans_azul.png',        1),
  (2, 'Pantalón Cargo Negro',       2, 'Negro',      44.99, '30, 32, 34',      6, 'cargo_negro.png',       1),
  (2, 'Gorra Béisbol Clásica',      3, 'Negro',      18.99, 'Única',          20, 'gorra_negra.png',       1),
  (2, 'Gorra Streetwear Vintage',   3, 'Verde',      21.99, 'Única',           9, 'gorra_verde.png',       1),
  (1, 'Tenis Sneaker Urban White',  4, 'Blanco',     59.99, '38-44',          10, 'tenis_blancos.png',     1),
  (2, 'Zapatillas Retro Runner',    4, 'Multicolor', 64.99, '38-44',           4, 'zapatillas_retro.png',  1),
  (1, 'Vestido Rojo Midi',          5, 'Rojo',       49.99, 'S, M',            5, 'vestido_rojo.png',      1);

INSERT INTO ajustes (id, nombre_sitio, eslogan) VALUES
  (1, 'V-TryOn Studio', 'Probador virtual para tiendas locales');

-- =====================================================================
--  Vistas para los reportes
-- =====================================================================
CREATE VIEW vista_catalogo_publico AS
SELECT p.id, p.nombre, c.nombre AS categoria, c.clave AS categoria_clave,
       t.nombre AS tienda, p.color, p.precio, p.tallas, p.existencias, p.imagen
FROM prendas p
JOIN categorias c ON c.id = p.categoria_id
LEFT JOIN tiendas t ON t.id = p.tienda_id
WHERE p.activa = TRUE AND (t.id IS NULL OR t.activa = TRUE);

-- Reporte principal: productos más probados
CREATE VIEW vista_mas_probadas AS
SELECT p.id, p.nombre, c.nombre AS categoria, COALESCE(t.nombre, 'Sin tienda') AS tienda,
       COUNT(pr.id) AS veces_probada
FROM prendas p
JOIN categorias c ON c.id = p.categoria_id
LEFT JOIN tiendas t ON t.id = p.tienda_id
LEFT JOIN pruebas pr ON pr.prenda_id = p.id
GROUP BY p.id, p.nombre, c.nombre, t.nombre
ORDER BY veces_probada DESC;

CREATE VIEW vista_pruebas_por_tienda AS
SELECT COALESCE(t.nombre, 'Sin tienda') AS tienda, COUNT(pr.id) AS veces_probada
FROM pruebas pr
LEFT JOIN tiendas t ON t.id = pr.tienda_id
GROUP BY t.nombre
ORDER BY veces_probada DESC;

CREATE VIEW vista_resumen_admin AS
SELECT
  (SELECT COUNT(*) FROM tiendas)               AS total_tiendas,
  (SELECT COUNT(*) FROM prendas)               AS total_prendas,
  (SELECT COUNT(*) FROM prendas WHERE activa)  AS prendas_visibles,
  (SELECT COUNT(*) FROM usuarios)              AS total_usuarios,
  (SELECT COUNT(*) FROM pruebas)               AS total_pruebas;

-- =====================================================================
--  Equivalencia con la versión publicada en Firebase
--  tiendas  -> colección stores/{id}
--  usuarios -> colección users/{uid}   (la contraseña la maneja Firebase Authentication)
--  prendas  -> colección garments/{id} (storeId = tienda_id, active = activa)
--  pruebas  -> colección tryons/{id}   (garmentIds y storeIds)
--  ajustes  -> documento settings/app
-- =====================================================================
