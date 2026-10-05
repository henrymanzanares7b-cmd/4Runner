# V-TryOn Studio

Probador virtual de ropa en el navegador. Subes una foto (o usas el maniquí incluido),
eliges prendas del catálogo y la ropa se deforma para seguir el cuerpo de la persona.

Proyecto final de la materia. Equipo de dos:

| Integrante | Rol |
|---|---|
| Luis | Frontend — interfaz, probador, catálogo |
| Henry | Backend — base de datos, API, administración |

---

## Qué hace

- **Probador virtual.** Detecta 33 puntos del cuerpo con MediaPipe Pose y usa una malla
  *Thin Plate Spline* para que la tela se adapte a hombros, pecho, cintura y caderas,
  en lugar de pegar la imagen plana encima.
- **Conjuntos completos.** Hasta 5 prendas a la vez (camisa, pantalón, vestido, gorra, zapatos),
  con una sola prenda por zona del cuerpo.
- **Catálogo navegable dentro del probador.** Filtros por tienda, categoría y texto.
- **Cámara guiada.** Muestra una silueta, valida la postura y dispara sola con cuenta regresiva.
- **Dos perfiles.** Usuario normal y administrador.
- **Panel de administración.** CRUD completo de prendas, tiendas y usuarios, ajustes del sitio
  y reporte de las prendas más probadas.

## Cómo está organizado

```
v-tryon-studio/
├── firebase/          Versión publicada en la web (Firebase Hosting)
│   ├── public/
│   │   └── index.html     La app completa: React + Babel en un solo archivo
│   ├── firebase.json
│   ├── .firebaserc
│   ├── firestore.rules
│   └── firestore.indexes.json
│
├── php/               Versión local para entregar (XAMPP)
│   ├── index.php          Tiendas
│   ├── catalogo.php
│   ├── probador.php
│   ├── login.php · registro.php · perfil.php · logout.php
│   ├── admin/             Panel de administración
│   ├── api/prueba.php     Registra cada prueba virtual
│   ├── assets/
│   │   ├── motor.js           El motor del probador (TPS, malla, MediaPipe)
│   │   ├── probador.js        Lógica de la pantalla del probador
│   │   └── estilo.css
│   ├── includes/          Conexión PDO, cabecera, pie
│   ├── uploads/           Imágenes de las prendas
│   └── database/
│       └── vtryon_db.sql  Esquema + datos de ejemplo
│
└── docs/              Diagramas y recursos de prueba
    ├── diagrama-arquitectura.png
    ├── diagrama-clases-modelo-datos.png
    ├── diagrama-clases-aplicacion.png
    └── maniqui_prueba.png
```

Las dos versiones comparten el mismo motor y el mismo modelo de datos. Cambia dónde viven
los datos: **Firestore** en la versión web, **MySQL** en la versión local.

---

## Levantar la versión PHP (XAMPP)

1. Copia la carpeta `php/` dentro de `C:\xampp\htdocs\` y renómbrala `vtryon-php`.
2. Arranca **Apache** y **MySQL** desde el panel de XAMPP.
3. Abre `http://localhost/phpmyadmin`, crea la base **`vtryon_studio`** e importa
   `php/database/vtryon_db.sql`.
4. Si tu MySQL tiene contraseña, ajústala en `php/includes/config.php` (`DB_CLAVE`).
5. Entra a `http://localhost/vtryon-php/`.

## Publicar la versión Firebase

```bash
npm install -g firebase-tools
firebase login
cd firebase
firebase deploy
```

Después del deploy, abre la URL que imprime la terminal y recarga con **Ctrl + F5**.

---

## Base de datos

7 tablas y 4 vistas:

| Tabla | Para qué |
|---|---|
| `roles` | admin / user |
| `tiendas` | Tiendas que publican ropa |
| `usuarios` | Cuentas, con `password_hash` |
| `categorias` | top, bottom, head, shoes, full |
| `prendas` | Catálogo |
| `pruebas` | Cada vez que alguien prueba una prenda |
| `ajustes` | Configuración del sitio |

Las vistas (`vista_catalogo_publico`, `vista_mas_probadas`, `vista_pruebas_por_tienda`,
`vista_resumen_admin`) alimentan el catálogo y el reporte del administrador.

El diagrama completo está en `docs/diagrama-clases-modelo-datos.png`.

---

## Tecnologías

- HTML, CSS y JavaScript (ES6)
- React 18 con Babel standalone · Tailwind
- Canvas 2D para la composición de las prendas
- MediaPipe Tasks Vision — Pose Landmarker
- Thin Plate Spline para la deformación de la tela
- PHP 8 con PDO y consultas preparadas
- MySQL 8 / MariaDB
- Firebase Hosting, Authentication y Firestore

---

## Antes de presentar

Las cuentas de ejemplo que trae el SQL usan contraseñas de prueba. Cámbialas, o al menos
cambia la del administrador, antes de mostrar el proyecto o dejar el repositorio público.
