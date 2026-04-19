/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismFramework, Option } from '@framework/live2dcubismframework';

import * as LAppDefine from './lappdefine';
import { LAppLive2DManager } from './lapplive2dmanager';
import { LAppPal } from './lapppal';
import { LAppTextureManager } from './lapptexturemanager';
import { LAppView } from './lappview';
import { canvas, gl } from './lappglmanager';
import { releaseIfPresent } from '../../src/runtime/live2d-disposal-utils.ts';
import { canInitializeLive2DDelegate } from '../../src/runtime/live2d-gl-context-utils.ts';
import { shouldRenderLive2DFrame } from '../../src/runtime/live2d-render-loop-utils.ts';

export let s_instance: LAppDelegate | null = null;
export let frameBuffer: WebGLFramebuffer | null = null;

// Debug tracking for touch and drag display
let _lastTouchStatus = '';
let _lastDragPos: { x: number; y: number } | null = null;


/**
 * アプリケーションクラス。
 * Cubism SDKの管理を行う。
 * 
 * 应用程序类。
 * 管理Cubism SDK。
 * 
 */
export class LAppDelegate {
  // Multi-drag tease detection instance variables
  private _dragTimestamps: number[] = [];
  private _lastTeaseTime: number = 0;
  private _teaseMessageShown: boolean = false;

  /**
   * クラスのインスタンス（シングルトン）を返す。
   * インスタンスが生成されていない場合は内部でインスタンスを生成する。
   * 
   * 返回类的实例（单例）。
   * 如果尚未创建实例，则在内部创建实例。
   *
   * @return クラスのインスタンス
   */
  public static getInstance(): LAppDelegate {
    if (s_instance == null) {
      s_instance = new LAppDelegate();
    }

    return s_instance;
  }

  /**
   * クラスのインスタンス（シングルトン）を解放する。
   * 
   * 释放类的实例（单例）。
   * 
   */
  public static releaseInstance(): void {
    if (s_instance != null) {
      s_instance.release();
    }

    s_instance = null;
  }

  /**
   * Initialize the application.
   */
  public initialize(): boolean {
    console.log('[DEBUG] LAppDelegate.initialize() called');
    // Comment out the following code since canvas already exists in DOM
    // let parent = document.getElementById('live2d');
    // if (parent) {
    //   parent.appendChild(canvas!);
    // } else {
    //   document.body.appendChild(canvas!);
    // }

    if (!canInitializeLive2DDelegate({ canvas, gl })) {
      console.warn("Live2D delegate initialization skipped because canvas or WebGL context is unavailable");
      return false;
    }

    if (LAppDefine.CanvasSize === 'auto') {
      this._resizeCanvas();
    } else {
      canvas!.width = LAppDefine.CanvasSize.width;
      canvas!.height = LAppDefine.CanvasSize.height;
    }

    if (!frameBuffer) {
      frameBuffer = gl!.getParameter(gl!.FRAMEBUFFER_BINDING);
    }

    // 透過設定
    // 透明设置
    gl!.enable(gl!.BLEND);
    gl!.blendFunc(gl!.SRC_ALPHA, gl!.ONE_MINUS_SRC_ALPHA);

    // 创建触摸调试窗口，永久显示
    console.log('[DEBUG] Creating touch debug window');
    this.showTouchDebug('waiting...');
    console.log('[DEBUG] Touch debug window created');

    const supportTouch: boolean = 'ontouchend' in canvas!;

    if (supportTouch) {
      // タッチ関連コールバック関数登録
      // 注册触摸相关回调函数
      canvas!.addEventListener('touchstart', onTouchBegan, { passive: false });
      canvas!.addEventListener('touchmove', onTouchMoved, { passive: false });
      canvas!.addEventListener('touchend', onTouchEnded, { passive: false });
      canvas!.addEventListener('touchcancel', onTouchCancel, { passive: false });
    } else {
      // マウス関連コールバック関数登録
      // 注册鼠标相关回调函数
      canvas!.addEventListener('mousedown', onClickBegan, { passive: true });
      canvas!.addEventListener('mousemove', onMouseMoved, { passive: true });
      canvas!.addEventListener('mouseup', onClickEnded, { passive: true });
    }

    // AppViewの初期化
    this._view!.initialize();

    // Cubism SDKの初期化
    this.initializeCubism();

    return true;
  }

  /**
   * Resize canvas and re-initialize view.
   */
  public onResize(): void {
    this._resizeCanvas();
    
    // Ensure view is properly initialized
    if (this._view && canvas) {
      this._view.initialize();
      this._view.initializeSprite();
      
      // Try to get and center the model
      const manager = LAppLive2DManager.getInstance();
      if (manager) {
        const model = manager.getModel(0);
        if (model) {
          // Keep model centered in canvas
          const width = canvas!.width;
          const height = canvas!.height;
          if (width > 0 && height > 0) {
            
            // Only force reset position if the model has not been dragged
            // @ts-ignore
            if (model.getModelMatrix && model.getModelMatrix().getArray()[12] === 0) {
              const view = this._view;
              if (view) {
                 const x = width / 2;
                 const y = height / 2;
                 const modelX = view._deviceToScreen.transformX(x);
                 const modelY = view._deviceToScreen.transformY(y);
                 
                 const matrix = model.getModelMatrix().getArray();
                 const newMatrix = [...matrix];
                 newMatrix[12] = modelX;
                 newMatrix[13] = modelY;
                 model.getModelMatrix().setMatrix(new Float32Array(newMatrix));
              }
            }
          }
        }
      }
    }
  }

  /**
   * 解放する。
   */
  public release(): void {
    releaseIfPresent(this._textureManager);
    this._textureManager = null;

    releaseIfPresent(this._view);
    this._view = null;

    // リソースを解放
    LAppLive2DManager.releaseInstance();

    // Cubism SDKの解放
    CubismFramework.dispose();
  }

  /**
   * 在页面上显示触摸调试信息
   */
  public showTouchDebug(message: string): void {
    // Track touch status (messages starting with "[")
    if (message.startsWith('[')) {
      _lastTouchStatus = message;
    }
    // Track drag position (messages starting with "drag")
    else if (message.startsWith('drag')) {
      const match = message.match(/drag \(([^,]+), ([^)]+)\)/);
      if (match) {
        _lastDragPos = { x: parseFloat(match[1]), y: parseFloat(match[2]) };
      }
    }

    let debugDiv = document.getElementById('touch-debug');
    if (!debugDiv) {
      debugDiv = document.createElement('div');
      debugDiv.id = 'touch-debug';
      debugDiv.style.cssText = `
        position: fixed;
        top: 10px;
        left: 10px;
        background: rgba(0, 0, 0, 0.8);
        color: #0f0;
        padding: 10px 15px;
        font-family: monospace;
        font-size: 14px;
        z-index: 999999;
        border-radius: 5px;
        min-width: 150px;
      `;
      document.body.appendChild(debugDiv);
    }

    // Display both touch status and drag position
    let displayText = _lastTouchStatus || 'no touch';
    if (_lastDragPos) {
      displayText += ` | drag (${_lastDragPos.x.toFixed(2)}, ${_lastDragPos.y.toFixed(2)})`;
    }
    debugDiv.textContent = displayText;
  }

  /**
   * 実行処理。
   * 执行处理。
   */
  public run(): void {
    // メインループ
    // 主循环
    const loop = (): void => {
      if (
        !shouldRenderLive2DFrame({
          activeInstance: s_instance,
          loopInstance: this,
          view: this._view,
          glContext: gl,
        })
      ) {
        return;
      }

      // 時間更新
      if (LAppDefine.ENABLE_LIMITED_FRAME_RATE) {
        LAppPal.updateTime(false);
        if (LAppPal.getDeltaTime() < 1 / LAppDefine.LIMITED_FRAME_RATE) {
          requestAnimationFrame(loop);
          return;
        }
      }

      LAppPal.updateTime(true);


      // 画面の初期化
      // 屏幕初始化
      gl!.clearColor(0.0, 0.0, 0.0, 0.0);

      // 深度テストを有効化
      // 启用深度测试
      gl!.enable(gl!.DEPTH_TEST);

      // 近くにある物体は、遠くにある物体を覆い隠す
      // 近距离的物体会遮挡远距离的物体
      gl!.depthFunc(gl!.LEQUAL);

      // カラーバッファや深度バッファをクリアする
      // 清除颜色缓冲区和深度缓冲区
      // gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl!.clear(gl!.DEPTH_BUFFER_BIT);

      gl!.clearDepth(1.0);

      // 透過設定
      gl!.enable(gl!.BLEND);
      gl!.blendFunc(gl!.SRC_ALPHA, gl!.ONE_MINUS_SRC_ALPHA);

      // 描画更新
      this._view!.render();

      // ループのために再帰呼び出し
      // 递归调用以进行循环
      requestAnimationFrame(loop);
    };
    loop();
  }

  /**
   * シェーダーを登録する。
   * 注册着色器。
   */
  public createShader(): WebGLProgram | null {
    // バーテックスシェーダーのコンパイル
    // 编译顶点着色器
    const vertexShaderId = gl!.createShader(gl!.VERTEX_SHADER);

    if (vertexShaderId == null) {
      LAppPal.printMessage('failed to create vertexShader');
      return null;
    }

    const vertexShader: string =
      'precision mediump float;' +
      'attribute vec3 position;' +
      'attribute vec2 uv;' +
      'varying vec2 vuv;' +
      'void main(void)' +
      '{' +
      '   gl_Position = vec4(position, 1.0);' +
      '   vuv = uv;' +
      '}';

    gl!.shaderSource(vertexShaderId, vertexShader);
    gl!.compileShader(vertexShaderId);

    // フラグメントシェーダのコンパイル
    const fragmentShaderId = gl!.createShader(gl!.FRAGMENT_SHADER);

    if (fragmentShaderId == null) {
      LAppPal.printMessage('failed to create fragmentShader');
      return null;
    }

    const fragmentShader: string =
      'precision mediump float;' +
      'varying vec2 vuv;' +
      'uniform sampler2D texture;' +
      'void main(void)' +
      '{' +
      '   gl_FragColor = texture2D(texture, vuv);' +
      '}';

    gl!.shaderSource(fragmentShaderId, fragmentShader);
    gl!.compileShader(fragmentShaderId);

    // プログラムオブジェクトの作成
    // 创建程序对象
    const programId = gl!.createProgram();
    gl!.attachShader(programId!, vertexShaderId);
    gl!.attachShader(programId!, fragmentShaderId);

    gl!.deleteShader(vertexShaderId);
    gl!.deleteShader(fragmentShaderId);

    // リンク
    // 链接
    gl!.linkProgram(programId!);

    gl!.useProgram(programId);

    return programId;
  }

  /**
   * View情報を取得する。
   */
  public getView(): LAppView | null {
    return this._view;
  }

  public getTextureManager(): LAppTextureManager | null {
    return this._textureManager;
  }

  /**
   * コンストラクタ
   * 构造函数
   */
  constructor() {
    this._captured = false;
    this._mouseX = 0.0;
    this._mouseY = 0.0;
    this._isEnd = false;

    this._cubismOption = new Option();
    this._view = new LAppView();
    this._textureManager = new LAppTextureManager();
  }

  /**
   * Cubism SDKの初期化
   */
  public initializeCubism(): void {
    // setup cubism
    this._cubismOption.logFunction = LAppPal.printMessage;
    this._cubismOption.loggingLevel = LAppDefine.CubismLoggingLevel;
    CubismFramework.startUp(this._cubismOption);

    // initialize cubism
    CubismFramework.initialize();

    // load model
    LAppLive2DManager.getInstance();

    LAppPal.updateTime();

    this._view!.initializeSprite();
  }

  /**
   * Resize the canvas to fill the screen.
   */
  private _resizeCanvas(): void {
    if (!canvas) {
      console.warn("Canvas is null, skipping resize");
      return;
    }
    // Guard against invalid canvas CSS size (e.g., before layout is computed)
    if (canvas.clientWidth <= 0 || canvas.clientHeight <= 0) {
      console.warn(`[CanvasCap] Invalid canvas CSS size: ${canvas.clientWidth}x${canvas.clientHeight}, skipping resize`);
      return;
    }
    // Cap canvas internal resolution to prevent GPU memory/precision issues on mobile
    const maxCanvasDim = 1920;
    let internalWidth = canvas.clientWidth * window.devicePixelRatio;
    let internalHeight = canvas.clientHeight * window.devicePixelRatio;
    const maxDim = Math.max(internalWidth, internalHeight);
    if (maxDim > maxCanvasDim) {
      const scale = maxCanvasDim / maxDim;
      internalWidth = Math.round(internalWidth * scale);
      internalHeight = Math.round(internalHeight * scale);
      console.log(`[CanvasCap] Capped canvas from ${canvas.clientWidth * window.devicePixelRatio}x${canvas.clientHeight * window.devicePixelRatio} to ${internalWidth}x${internalHeight}`);
    }
    canvas.width = internalWidth;
    canvas.height = internalHeight;
    if (gl) {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    }
  }

  _cubismOption: Option; // Cubism SDK Option
  _view: LAppView | null; // View情報  // 视图信息
  _captured: boolean; // クリックしているか // 是否点击
  _mouseX: number; // マウスX座標 // 鼠标X坐标
  _mouseY: number; // マウスY座標 // 鼠标Y坐标
  _isEnd: boolean; // APP終了しているか // APP是否已结束
  _textureManager: LAppTextureManager | null; // テクスチャマネージャー // 纹理管理器

  /**
   * 检查是否满足多次拖拽触发条件
   * 如果满足4次拖拽在60秒内，则触发撩消息
   */
  public checkMultiDragTease(): void {
    const now = Date.now();
    const windowMs = 60 * 1000;  // 60秒内
    const cooldownMs = 30 * 1000;  // 30秒冷却
    const threshold = 4;  // 4次拖拽触发

    console.log("[DEBUG] checkMultiDragTease called, _teaseMessageShown=" + this._teaseMessageShown + ", _lastTeaseTime=" + this._lastTeaseTime);

    // 检查冷却中
    if (this._teaseMessageShown && now - this._lastTeaseTime < cooldownMs) {
      console.log("[DEBUG] checkMultiDragTease: in cooldown, returning");
      return;
    }

    // 冷却过期，重置标志
    if (this._teaseMessageShown && now - this._lastTeaseTime >= cooldownMs) {
      console.log("[DEBUG] checkMultiDragTease: cooldown expired, resetting flag");
      this._teaseMessageShown = false;
    }

    this._dragTimestamps.push(now);
    console.log("[DEBUG] checkMultiDragTease: pushed timestamp, _dragTimestamps.length=" + this._dragTimestamps.length);

    // 过滤出60秒内的时间戳
    this._dragTimestamps = this._dragTimestamps.filter((t: number) => now - t <= windowMs);
    console.log("[DEBUG] checkMultiDragTease: after filter, _dragTimestamps.length=" + this._dragTimestamps.length);

    if (this._dragTimestamps.length < threshold) {
      return;
    }

    // 检查时间窗口
    const first = this._dragTimestamps[0];
    const last = this._dragTimestamps[this._dragTimestamps.length - 1];
    console.log("[DEBUG] checkMultiDragTease: threshold reached! count=" + this._dragTimestamps.length + ", first=" + first + ", last=" + last + ", diff=" + (last - first));

    if (last - first <= windowMs) {
      console.log("[DEBUG] checkMultiDragTease: time window OK, calling triggerTease!");
      this.triggerTease();
      this._dragTimestamps = [];
    } else {
      console.log("[DEBUG] checkMultiDragTease: time window too large, not triggering");
    }
  }

  /**
   * 触发撩消息
   */
  public triggerTease(): void {
    const now = Date.now();
    this._lastTeaseTime = now;
    this._teaseMessageShown = true;

    const messages = [
      "姐姐你摸够了没呀~再摸我要生气啦！😤",
      "呜~姐姐不要一直摸我嘛，会害羞的嘞~🎀",
      "嘿嘿，姐姐这么喜欢我呀？不过也要休息一下嘞~",
      "再摸我就要逃跑了哦~ 哼！😝",
      "姐姐的手好温暖...但是！不许再摸了！💢",
    ];

    const message = messages[Math.floor(Math.random() * messages.length)];
    this.showTouchDebug("[TEASE] " + message);

    // 调用全局的 triggerLive2DTeaseMessage 函数（如果存在）
    if (typeof (window as any).triggerLive2DTeaseMessage === 'function') {
      (window as any).triggerLive2DTeaseMessage(message);
    }
  }
}

/**
 * クリックしたときに呼ばれる。
 * 当单击时调用。
 */
function onClickBegan(e: MouseEvent): void {
  if (!LAppDelegate.getInstance()._view) {
    LAppPal.printMessage('view notfound');
    return;
  }
  LAppDelegate.getInstance()._captured = true;

  const posX: number = e.pageX;
  const posY: number = e.pageY;

  // 检查是否触发撩消息
  LAppDelegate.getInstance().checkMultiDragTease();

  LAppDelegate.getInstance()._view!.onTouchesBegan(posX, posY);
}

/**
 * マウスポインタが動いたら呼ばれる。
 */
function onMouseMoved(e: MouseEvent): void {
  if (!LAppDelegate.getInstance()._captured) {
    return;
  }

  if (!LAppDelegate.getInstance()._view) {
    LAppPal.printMessage('view notfound');
    return;
  }

  const rect = (e.target as Element).getBoundingClientRect();
  const posX: number = e.clientX - rect.left;
  const posY: number = e.clientY - rect.top;

  LAppDelegate.getInstance()._view!.onTouchesMoved(posX, posY);
}

/**
 * クリックが終了したら呼ばれる。
 */
function onClickEnded(e: MouseEvent): void {
  LAppDelegate.getInstance()._captured = false;
  if (!LAppDelegate.getInstance()._view) {
    LAppPal.printMessage('view notfound');
    return;
  }

  const rect = (e.target as Element).getBoundingClientRect();
  const posX: number = e.clientX - rect.left;
  const posY: number = e.clientY - rect.top;

  LAppDelegate.getInstance()._view!.onTouchesEnded(posX, posY);
}

/**
 * タッチしたときに呼ばれる。
 */
function onTouchBegan(e: TouchEvent): void {
  LAppDelegate.getInstance()._captured = true;

  const posX = e.changedTouches[0].pageX;
  const posY = e.changedTouches[0].pageY;

  // 检查是否触发撩消息
  LAppDelegate.getInstance().checkMultiDragTease();

  LAppDelegate.getInstance().showTouchDebug(`[START] (${posX.toFixed(0)}, ${posY.toFixed(0)})`);

  LAppDelegate.getInstance()._view!.onTouchesBegan(posX, posY);

  // 清除手指抬起重置标志，允许新的拖拽
  const live2DManager: LAppLive2DManager = LAppLive2DManager.getInstance();
  const model = live2DManager.getModel(0);
  if (model) {
    model.clearTouchEndedFlag();
  }
}

/**
 * スワイプすると呼ばれる。
 */
function onTouchMoved(e: TouchEvent): void {
  if (!LAppDelegate.getInstance()._captured) {
    return;
  }

  if (!LAppDelegate.getInstance()._view) {
    LAppPal.printMessage('view notfound');
    return;
  }

  const rect = (e.target as Element).getBoundingClientRect();

  const posX = e.changedTouches[0].clientX - rect.left;
  const posY = e.changedTouches[0].clientY - rect.top;

  LAppDelegate.getInstance()._view!.onTouchesMoved(posX, posY);
}

/**
 * タッチが終了したら呼ばれる。
 */
function onTouchEnded(e: TouchEvent): void {
  // 最显眼的调试信息，确保能看到
  LAppDelegate.getInstance().showTouchDebug('!!! ON_TOUCH_END CALLED !!!');
  console.log('[CRITICAL] onTouchEnded event fired!');
  
  try {
    LAppDelegate.getInstance()._captured = false;

    if (!LAppDelegate.getInstance()._view) {
      LAppPal.printMessage('view notfound');
      return;
    }

    const rect = (e.target as Element).getBoundingClientRect();

    const posX = e.changedTouches[0].clientX - rect.left;
    const posY = e.changedTouches[0].clientY - rect.top;
    LAppDelegate.getInstance().showTouchDebug(`[END] (${posX.toFixed(0)}, ${posY.toFixed(0)})`);

    LAppDelegate.getInstance()._view!.onTouchesEnded(posX, posY);

    // 重置drag为0，确保touchend后目光回到中心
    console.log('[DEBUG] onTouchEnded calling onDrag(0.0, 0.0)');
    const live2DManager: LAppLive2DManager = LAppLive2DManager.getInstance();
    live2DManager.onDrag(0.0, 0.0);
    console.log('[DEBUG] onDrag called');
    LAppDelegate.getInstance().showTouchDebug('[DEBUG] onDrag called');
    
    // 打印drag manager的实际值
    const model = live2DManager.getModel(0);
    if (model) {
      const dragX = model.getDraggingX();
      const dragY = model.getDraggingY();
      console.log(`[DEBUG] After onDrag: dragX=${dragX}, dragY=${dragY}`);
      LAppDelegate.getInstance().showTouchDebug(`drag=(${dragX.toFixed(2)}, ${dragY.toFixed(2)})`);

      // 通知 model 在下一帧强制归零 drag 值（安全网）
      model.resetDragOnTouchEnd();
    }
  } catch (error) {
    LAppDelegate.getInstance().showTouchDebug(`[ERROR] ${error}`);
    console.error('[DEBUG] onTouchEnded error:', error);
  }
}

/**
 * 触摸被取消时调用。
 * touchcancel时直接重置drag为(0,0)，确保目光回到中心
 */
function onTouchCancel(e: TouchEvent): void {
  e.preventDefault();  // 阻止同时触发 mouseup

  LAppDelegate.getInstance()._captured = false;

  LAppDelegate.getInstance().showTouchDebug(`[CANCEL]`);

  // 直接重置drag为0，确保touchcancel时目光回到中心
  const live2DManager: LAppLive2DManager = LAppLive2DManager.getInstance();
  live2DManager.onDrag(0.0, 0.0);

  // 通知 model 在下一帧强制归零 drag 值（安全网）
  const model = live2DManager.getModel(0);
  if (model) {
    model.resetDragOnTouchEnd();
  }
}
