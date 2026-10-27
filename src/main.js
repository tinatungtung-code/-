import { BreakoutGame } from './game.js';
import { sound } from './sound.js';

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game-canvas');
  if (!canvas) return;

  const hudElements = {
    score: document.getElementById('hud-score'),
    highScore: document.getElementById('hud-highscore'),
    stage: document.getElementById('hud-stage'),
    livesContainer: document.getElementById('hud-lives'),
    powerupsContainer: document.getElementById('hud-powerups'),
    btnMute: document.getElementById('btn-mute'),
    btnPause: document.getElementById('btn-pause'),
    screens: {
      title: document.getElementById('screen-title'),
      pause: document.getElementById('screen-pause'),
      gameover: document.getElementById('screen-gameover')
    }
  };

  const game = new BreakoutGame(canvas, hudElements);
  game.startLoop();

  // Primary Start Button on Title Screen
  const btnStart = document.getElementById('btn-start');
  if (btnStart) {
    btnStart.addEventListener('click', () => {
      game.startRun();
    });
  }

  // Difficulty buttons
  const diffBtns = document.querySelectorAll('[data-difficulty]');
  diffBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      diffBtns.forEach(b => b.classList.remove('active', 'border-cyan-400', 'bg-cyan-500/20', 'text-cyan-300'));
      btn.classList.add('active', 'border-cyan-400', 'bg-cyan-500/20', 'text-cyan-300');
      game.difficulty = btn.dataset.difficulty;
    });
  });

  // Stage select buttons
  const stageBtns = document.querySelectorAll('[data-stage]');
  stageBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      stageBtns.forEach(b => b.classList.remove('active', 'border-emerald-400', 'bg-emerald-500/20', 'text-emerald-300'));
      btn.classList.add('active', 'border-emerald-400', 'bg-emerald-500/20', 'text-emerald-300');
      const stIdx = parseInt(btn.dataset.stage, 10);
      game.currentStageIndex = stIdx;
      game.resetToStage(stIdx, false);
    });
  });

  // HUD Mute & Pause buttons
  if (hudElements.btnMute) {
    hudElements.btnMute.addEventListener('click', () => {
      const isMuted = sound.toggleMute();
      game.updateMuteButton(isMuted);
    });
  }

  if (hudElements.btnPause) {
    hudElements.btnPause.addEventListener('click', () => {
      if (game.state === 'playing') {
        game.setGameState('paused');
      } else if (game.state === 'paused') {
        game.setGameState('playing');
      }
    });
  }

  // Pause menu buttons
  const btnResume = document.getElementById('btn-resume');
  if (btnResume) {
    btnResume.addEventListener('click', () => {
      game.setGameState('playing');
    });
  }

  const btnPauseRestart = document.getElementById('btn-pause-restart');
  if (btnPauseRestart) {
    btnPauseRestart.addEventListener('click', () => {
      game.startRun();
    });
  }

  const btnPauseMenu = document.getElementById('btn-pause-menu');
  if (btnPauseMenu) {
    btnPauseMenu.addEventListener('click', () => {
      game.setGameState('title');
    });
  }

  // Game over buttons
  const btnRetry = document.getElementById('btn-retry');
  if (btnRetry) {
    btnRetry.addEventListener('click', () => {
      game.startRun();
    });
  }

  const btnGameoverMenu = document.getElementById('btn-gameover-menu');
  if (btnGameoverMenu) {
    btnGameoverMenu.addEventListener('click', () => {
      game.setGameState('title');
    });
  }

  // Mobile Launch / Fire Bar
  const btnMobileAction = document.getElementById('btn-mobile-action');
  if (btnMobileAction) {
    btnMobileAction.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      game.handleActionTrigger();
    });
  }

  // Support ?autostart=1 parameter for automated testing and quick start
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('autostart') === '1') {
    game.startRun();
  }
});
