# Dimension Shift: Sci-Fi Arena 🚀

**Final project for the Interactive Graphics course (A.Y. 2025/2026)**
*Sapienza University of Rome*

---

## 👥 Student Information
- **Name:** Mattia
- **Surname:** Cosimi
- **Student ID (Matricola):** 2278125
- **GitHub Repository:** (https://github.com/SapienzaInteractiveGraphicsCourse/final-project-rice-and-chicken.git)
- **Live Demo (GitHub Pages):** 👉 

---

## 🎮 Project Description
**Dimension Shift: Sci-Fi Arena** is a 3D third-person shooter with a fixed isometric camera, built entirely using **Three.js** (WebGL). The player controls a character inside a dynamic arena and must survive waves of incoming enemies.

The core mechanic of the game is the **Dimension Shift**: by pressing TAB, the entire arena instantly changes its geometry and aesthetic style, shifting from a **Low-Poly/Toon (Cartoon)** look to a **Realistic (PBR - Physically Based Rendering)** style. This feature goes beyond visuals, dynamically altering material properties and lighting calculations directly on the GPU.

## 🚀 How to Run the Project Locally

Since this project uses modern ES Modules (imported via CDN), it does not require complex build tools like Webpack or Vite. However, due to browser security restrictions (CORS) when loading local textures and models, you must run a simple local web server:

1. Ensure you have [Node.js](https://nodejs.org/) installed.
2. Install a lightweight static file server (e.g., `http-server` or use the *Live Server* extension in VS Code):
   ```bash
   npm install -g http-server
