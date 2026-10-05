# V-TryOn Studio

Estructura lista para Firebase Hosting + Firestore.

- `public/index.html` — la app (probador, catálogo, perfil y panel de admin)
- `firestore.rules` — reglas de seguridad (solo el admin modifica el catálogo)
- `database/vtryon_db.sql` — modelo relacional de la base de datos
- `firebase.json`, `.firebaserc`, `firestore.indexes.json` — configuración del proyecto `runner-b3ea0`

## Antes de publicar
1. Cambia `admin@vtryon.com` por el correo del administrador en `public/index.html` (constante `ADMIN_EMAILS`) y en `firestore.rules`.
2. En la consola de Firebase: Authentication → activar "Correo electrónico/contraseña".
3. En la consola de Firebase: crear la base de datos de Firestore.

## Publicar
```
npm install -g firebase-tools
firebase login
firebase deploy
```

## Primer ingreso del admin
Regístrate en la app con el correo de administrador, entra a **Admin → Catálogo** y toca **Subir catálogo base**.
