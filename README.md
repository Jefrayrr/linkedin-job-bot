# LinkedIn Job Bot - Navegador Remoto

Sistema de automatización para LinkedIn con control remoto de navegador integrado. Implementa una arquitectura de **render remoto + control remoto de navegador** que permite interactuar con LinkedIn a través de un dashboard web.

## 🏗️ Arquitectura

El sistema está compuesto por:

- **Servidor Node.js**: Orquestador principal con WebSocket
- **Puppeteer**: Motor de automatización del navegador Chrome
- **Cliente Web**: Dashboard con render remoto y captura de eventos
- **WebSocket**: Comunicación en tiempo real entre cliente y servidor

## 🚀 Funcionalidades

- ✅ Iniciar/controlar navegador Chrome remotamente
- ✅ Visualización en tiempo real del navegador
- ✅ Captura de coordenadas de mouse con transformación automática
- ✅ Entrada de texto y teclas especiales
- ✅ Navegación automática a LinkedIn
- ✅ Interfaz moderna y responsive

## 📋 Requisitos

- Node.js 16+ 
- Chrome/Chromium
- Windows/Linux/macOS

## 🛠️ Instalación

1. **Clonar el repositorio**
```bash
git clone <repository-url>
cd linkedin-job-bot
```

2. **Instalar dependencias**
```bash
npm install
```

3. **Iniciar el servidor**
```bash
# Desarrollo
npm run dev

# Producción
npm start
```

4. **Acceder al dashboard**
Abre tu navegador en: `http://localhost:3000`

## 🎮 Uso

1. **Iniciar el Navegador**
   - Presiona el botón "Iniciar Navegador"
   - Espera a que Chrome se inicie y cargue LinkedIn

2. **Interactuar con LinkedIn**
   - Haz clic en cualquier elemento de la vista remota
   - Usa el campo de texto para escribir credenciales
   - Las teclas especiales (Enter, Backspace, etc.) funcionan automáticamente

3. **Control Remoto**
   - Los clics se transforman automáticamente al espacio real del navegador
   - Las coordenadas se ajustan según el tamaño del viewport
   - La vista se actualiza después de cada interacción

## 🔧 Configuración

### Viewport del Navegador
El navegador se configura con un viewport fijo de 1280x720px. Esto se puede modificar en `src/server.js`:

```javascript
const VIEWPORT_CONFIG = {
  width: 1280,
  height: 720
};
```

### Puerto del Servidor
Por defecto el servidor corre en el puerto 3000. Puedes cambiarlo con la variable de entorno `PORT`:

```bash
PORT=8080 npm start
```

## ⚠️ Limitaciones y Consideraciones

- **Latencia**: Puede haber un pequeño retraso en la respuesta visual
- **Detección**: LinkedIn puede detectar la automatización en algunos casos
- **Recursos**: Cada sesión de navegador consume recursos del sistema
- **Seguridad**: No almacenar credenciales en el código

## 🏛️ Estructura del Proyecto

```
linkedin-job-bot/
├── src/
│   └── server.js          # Servidor principal con WebSocket y Puppeteer
├── public/
│   ├── index.html         # Dashboard principal
│   ├── css/
│   │   └── style.css      # Estilos del dashboard
│   └── js/
│       └── browser-client.js  # Cliente WebSocket y manejo de eventos
├── package.json           # Dependencias y scripts
└── README.md             # Documentación
```

## 🔌 API WebSocket

### Eventos del Cliente → Servidor

- `start-browser`: Iniciar nueva sesión de navegador
- `request-screenshot`: Solicitar captura de pantalla
- `mouse-click`: Enviar coordenadas de clic
- `keyboard-type`: Enviar texto para escribir
- `keyboard-key`: Enviar tecla especial

### Eventos del Servidor → Cliente

- `browser-screen`: Enviar imagen actual del navegador
- `browser-status`: Notificar estado del navegador

## 🚨 Seguridad

- El sistema corre localmente por defecto
- No se exponen credenciales externamente
- Las sesiones se aíslan por ID de socket
- El navegador se cierra automáticamente al desconectar

## 🔄 Flujo de Trabajo

1. **Inicialización**: Cliente solicita iniciar navegador
2. **Conexión**: Servidor lanza Chrome con Puppeteer
3. **Navegación**: Se carga LinkedIn automáticamente
4. **Render**: Servidor captura y envía frames al cliente
5. **Interacción**: Cliente envía eventos de mouse/teclado
6. **Ejecución**: Servidor traduce eventos a acciones reales
7. **Retroalimentación**: Nuevo frame se envía al cliente

## 🐛 Troubleshooting

### Chrome no inicia
- Verifica que Chrome/Chromium esté instalado
- Revisa permisos del sistema
- Intenta ejecutar como administrador

### Conexión fallida
- Verifica que el puerto 3000 esté disponible
- Revisa el firewall
- Revisa la consola del navegador

### Coordenadas incorrectas
- Verifica el tamaño del viewport en la configuración
- Asegúrate de hacer clic dentro del área del navegador
- Revisa la transformación de coordenadas en el cliente

## 📝 Desarrollo

### Agregar nuevas funcionalidades

1. **Servidor**: Modificar `src/server.js`
2. **Cliente**: Modificar `public/js/browser-client.js`
3. **Estilos**: Modificar `public/css/style.css`
4. **Interfaz**: Modificar `public/index.html`

### Extender la automatización

El sistema está diseñado para extenderse fácilmente:

```javascript
// Ejemplo: Agregar nueva acción
socket.on('custom-action', async (data) => {
  const session = browserSessions.get(socket.id);
  if (session && session.isInitialized) {
    // Implementar lógica personalizada
    await session.page.evaluate(() => {
      // Código JavaScript en el navegador
    });
  }
});
```

## 📄 Licencia

MIT License - ver archivo LICENSE para detalles
