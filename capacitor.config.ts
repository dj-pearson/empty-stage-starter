import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.557705df376a4cc39b6904130574113f',
  appName: 'empty-stage-starter',
  webDir: 'dist',
  server: {
    url: 'https://557705df-376a-4cc3-9b69-04130574113f.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  plugins: {
    BarcodeScanner: {
      hideWebcam: true
    }
  }
};

export default config;
