import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

import { execSync } from 'child_process';

const localFileSaverPlugin = () => ({
  name: 'local-file-saver',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url === '/api/save-file' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
          body += chunk;
        });
        req.on('end', () => {
          try {
            const { fileName, base64Data } = JSON.parse(body);
            const buffer = Buffer.from(base64Data, 'base64');
            
            // Save inside the "2026" directory relative to project
            const saveDir = path.resolve(__dirname, '../2026');
            if (!fs.existsSync(saveDir)) {
              fs.mkdirSync(saveDir, { recursive: true });
            }
            const filePath = path.join(saveDir, fileName);
            
            fs.writeFileSync(filePath, buffer);
            console.log(`[local-file-saver] Saved file directly to ${filePath}`);
            
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, path: filePath }));
          } catch (err: any) {
            console.error('[local-file-saver] Error saving file:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
        });
      } else if (req.url === '/api/solve-timetable' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          const tempInputPath = path.join(__dirname, '.temp_solve_input.json');
          try {
            fs.writeFileSync(tempInputPath, body);
            const pythonScript = path.join(__dirname, 'api/solve_timetable.py');
            const output = execSync(`python3 "${pythonScript}" "${tempInputPath}"`, { encoding: 'utf-8' });
            
            if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(output);
          } catch (err: any) {
            if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
            console.error('[local-solver] Python execution failed, falling back:', err.message);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ status: 'ERROR', message: err.message }));
          }
        });
      } else {
        next();
      }
    });
  }
});

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), localFileSaverPlugin()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
