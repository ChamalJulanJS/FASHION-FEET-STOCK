import * as THREE from 'three';

export interface WebXRCallbacks {
  onFloorDetected: (detected: boolean) => void;
  onPointPlaced: (pointIndex: 1 | 2, pos: THREE.Vector3) => void;
  onMeasured: (lengthCm: number) => void;
  onSessionEnded: () => void;
  onError: (msg: string) => void;
}

export class WebXRMeasureManager {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private session: XRSession | null = null;
  private hitTestSource: XRHitTestSource | null = null;
  private referenceSpace: XRReferenceSpace | null = null;

  private reticle: THREE.Mesh | null = null;
  private sphere1: THREE.Mesh | null = null;
  private sphere2: THREE.Mesh | null = null;
  private connectingLine: THREE.Line | null = null;

  public p1: THREE.Vector3 | null = null;
  public p2: THREE.Vector3 | null = null;

  constructor(private callbacks: WebXRCallbacks) {}

  static async isSupported(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !(navigator as any).xr) return false;
    try {
      return await (navigator as any).xr.isSessionSupported('immersive-ar');
    } catch {
      return false;
    }
  }

  async start(domOverlayRoot: HTMLElement): Promise<void> {
    try {
      const xr = (navigator as any).xr;
      if (!xr) throw new Error('WebXR is not supported on this browser.');

      const sessionInit: XRSessionInit = {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: domOverlayRoot },
      };

      this.session = await xr.requestSession('immersive-ar', sessionInit);
      if (!this.session) throw new Error('Could not create immersive-ar session.');

      // 1. Scene, Camera, Lights
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

      const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
      this.scene.add(light);

      // 2. Renderer
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      this.renderer.setPixelRatio(window.devicePixelRatio);
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.xr.enabled = true;
      await this.renderer.xr.setSession(this.session);

      // 3. 3D Reticle (Glowing Ring on floor)
      const ringGeo = new THREE.RingGeometry(0.04, 0.05, 32).rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
      this.reticle = new THREE.Mesh(ringGeo, ringMat);
      this.reticle.matrixAutoUpdate = false;
      this.reticle.visible = false;
      this.scene.add(this.reticle);

      // 4. Hit Test setup
      this.referenceSpace = await this.session.requestReferenceSpace('local');
      const viewerSpace = await this.session.requestReferenceSpace('viewer');
      this.hitTestSource = await this.session.requestHitTestSource!({ space: viewerSpace })!;

      // 5. User Tap Event (select)
      this.session.addEventListener('select', () => this.handleTap());
      this.session.addEventListener('end', () => {
        this.cleanUp();
        this.callbacks.onSessionEnded();
      });

      // 6. Animation loop
      this.renderer.setAnimationLoop((timestamp, frame) => {
        if (frame && this.hitTestSource && this.referenceSpace && this.reticle) {
          const hitTestResults = frame.getHitTestResults(this.hitTestSource);
          if (hitTestResults.length > 0) {
            const hit = hitTestResults[0];
            const pose = hit.getPose(this.referenceSpace);
            if (pose) {
              this.reticle.visible = true;
              this.reticle.matrix.fromArray(pose.transform.matrix);
              this.callbacks.onFloorDetected(true);
            }
          } else {
            this.reticle.visible = false;
          }
        }
        if (this.renderer && this.scene && this.camera) {
          this.renderer.render(this.scene, this.camera);
        }
      });
    } catch (err: any) {
      console.error('Failed to start WebXR:', err);
      this.cleanUp();
      this.callbacks.onError(err.message || 'Could not start AR session.');
    }
  }

  handleTap() {
    if (!this.reticle || !this.reticle.visible || !this.scene) return;

    const position = new THREE.Vector3().setFromMatrixPosition(this.reticle.matrix);

    if (!this.p1) {
      // Set Point 1 (Heel)
      this.p1 = position.clone();
      const sphereGeo = new THREE.SphereGeometry(0.015, 16, 16);
      const sphereMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
      this.sphere1 = new THREE.Mesh(sphereGeo, sphereMat);
      this.sphere1.position.copy(this.p1);
      this.scene.add(this.sphere1);
      this.callbacks.onPointPlaced(1, this.p1);
    } else if (!this.p2) {
      // Set Point 2 (Toe)
      this.p2 = position.clone();
      const sphereGeo = new THREE.SphereGeometry(0.015, 16, 16);
      const sphereMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      this.sphere2 = new THREE.Mesh(sphereGeo, sphereMat);
      this.sphere2.position.copy(this.p2);
      this.scene.add(this.sphere2);

      // Connecting Line
      const lineGeo = new THREE.BufferGeometry().setFromPoints([this.p1, this.p2]);
      const lineMat = new THREE.LineBasicMaterial({ color: 0xfacc15, linewidth: 4 });
      this.connectingLine = new THREE.Line(lineGeo, lineMat);
      this.scene.add(this.connectingLine);

      // Distance
      const distMeters = this.p1.distanceTo(this.p2);
      const lengthCm = Number((distMeters * 100).toFixed(1));
      this.callbacks.onPointPlaced(2, this.p2);
      this.callbacks.onMeasured(lengthCm);
    }
  }

  resetMeasurement() {
    if (this.sphere1 && this.scene) this.scene.remove(this.sphere1);
    if (this.sphere2 && this.scene) this.scene.remove(this.sphere2);
    if (this.connectingLine && this.scene) this.scene.remove(this.connectingLine);

    this.sphere1 = null;
    this.sphere2 = null;
    this.connectingLine = null;
    this.p1 = null;
    this.p2 = null;
  }

  stop() {
    if (this.session) {
      this.session.end().catch(() => {});
    }
    this.cleanUp();
  }

  private cleanUp() {
    if (this.renderer) {
      this.renderer.setAnimationLoop(null);
      this.renderer.dispose();
      this.renderer = null;
    }
    this.session = null;
    this.hitTestSource = null;
    this.referenceSpace = null;
    this.scene = null;
    this.camera = null;
    this.reticle = null;
    this.p1 = null;
    this.p2 = null;
  }
}
