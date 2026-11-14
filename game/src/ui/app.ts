import { APP_VERSION, ECONOMY } from '../config';
import { dailyTargetFor, Game, type ClearedCell, type Mode, type PlaceResult } from '../core/game';
import { Special } from '../core/generator';
import { InputController } from '../input';
import { Renderer, type ToolMode } from '../render/renderer';
import { AdManager } from '../services/ads';
import { track } from '../services/analytics';
import { sfx } from '../services/audio';
import { haptic, setHapticsEnabled } from '../services/haptics';
import { detectLang, getLang, LANG_NAMES, setLang, t, type Lang, type StrKey } from '../services/i18n';
import {
  BOOSTERS,
  completeDaily,
  dateKey,
  liveDailyStreak,
  sanitizeProfile,
  type BoosterKind,
  type Profile,
} from '../services/profile';
import { flushStorage, loadJSON, removeKey, saveJSON } from '../services/storage';
import { $, formatNumber, h, icon } from './dom';
import type { IconName } from './icons';

const SAVE_KEY = (m: Mode) => `game.${m}`;
const BOOSTER_ICON: Record<BoosterKind, IconName> = { rotate: 'rotate', hammer: 'hammer', reroll: 'reroll' };
const BOOSTER_DESC: Record<BoosterKind, StrKey> = { rotate: 'rotateDesc', hammer: 'hammerDesc', reroll: 'rerollDesc' };
const NO_MOVES_DELAY = 700;

/** Owns the screens and wires the pure game model to rendering, input, audio, storage and ads. */
export class App {
  private profile!: Profile;
  private saves: Record<Mode, unknown> = { classic: null, daily: null };
  private game: Game | null = null;
  private readonly renderer: Renderer;
  private readonly input: InputController;
  private readonly ads = new AdManager();
  private modal: { el: HTMLElement; onBack?: () => void } | null = null;
  private screen: 'home' | 'game' = 'home';
  /** Blocks gameplay input while an async flow (ad, transition) runs. */
  private busy = false;
  /** Out of moves, but the player chose to try boosters. */
  private stuck = false;
  private noMovesTimer = 0;
  private toastTimer = 0;
  private shownScore = 0;
  private scoreRaf = 0;
  private boosterEls = {} as Record<BoosterKind, { btn: HTMLButtonElement; badge: HTMLElement }>;

  constructor() {
    const canvas = $('board') as HTMLCanvasElement;
    this.renderer = new Renderer(canvas);
    this.input = new InputController(canvas, this.renderer, () => this.game, {
      canInteract: () => this.screen === 'game' && !this.modal && !this.busy,
      onPick: () => sfx.pick(),
      onDrop: (s, r, c) => this.place(s, r, c),
      onInvalidDrop: () => sfx.invalid(),
      onRotateTap: (s) => this.rotateTap(s),
      onRotateTool: (s) => this.rotateTool(s),
      onHammer: (r, c) => this.hammer(r, c),
    });
  }

  async init(): Promise<void> {
    this.profile = sanitizeProfile(await loadJSON('profile'));
    this.saves.classic = await loadJSON(SAVE_KEY('classic'));
    this.saves.daily = await loadJSON(SAVE_KEY('daily'));
    setLang(this.profile.settings.lang ?? detectLang());
    sfx.enabled = this.profile.settings.sound;
    setHapticsEnabled(this.profile.settings.haptics);
    this.ads.noAds = this.profile.noAds;

    this.buildStaticUi();
    new ResizeObserver(() => {
      this.renderer.resize();
      this.updateHint();
    }).observe($('board'));
    // iOS only accepts some gesture types as permission to start audio; listen to all of them.
    for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click']) {
      window.addEventListener(ev, () => sfx.unlock(), { passive: true, capture: true });
    }
    document.addEventListener('click', (e) => {
      if ((e.target as Element | null)?.closest?.('button')) sfx.click();
    });

    this.showHome();
    void this.ads.init(); // consent + preload; never blocks startup
  }

  // ================================================================== static UI

  private buildStaticUi(): void {
    const pause = $('btn-pause');
    pause.append(icon('pause'));
    pause.addEventListener('click', () => this.showPause());

    $('coins').append(icon('coin'), h('span'));
    $('best').append(icon('crown'), h('span'));

    const bar = $('boosters');
    for (const kind of BOOSTERS) {
      const badge = h('span', { class: 'badge' });
      const btn = h('button', { class: 'booster', attrs: { 'aria-label': kind } }, icon(BOOSTER_ICON[kind]), badge);
      btn.addEventListener('click', () => this.activateBooster(kind));
      bar.append(btn);
      this.boosterEls[kind] = { btn, badge };
    }
    $('give-up').addEventListener('click', () => this.gameOver());
  }

  private setGameChromeVisible(on: boolean): void {
    for (const id of ['hud', 'subhud', 'boosters']) $(id).hidden = !on;
    $('home').hidden = on;
    if (!on) {
      $('give-up').hidden = true;
      $('hint').hidden = true;
    }
  }

  // ================================================================== home

  showHome(): void {
    this.closeModal();
    this.input.cancel();
    this.setTool('none');
    clearTimeout(this.noMovesTimer);
    this.stuck = false;
    this.screen = 'home';
    this.game = null;
    this.renderer.game = null;
    this.renderer.fx.clear();
    this.renderer.invalidate();
    this.setGameChromeVisible(false);
    this.renderHome();
  }

  private renderHome(): void {
    const p = this.profile;
    const today = dateKey();
    const saved = this.saves.classic as { score?: number } | null;
    const hasSave = !!saved && Game.deserialize(saved) !== null;

    const coins = h('div', { class: 'coin-pill' }, icon('coin'), h('span', { text: formatNumber(p.coins) }));
    const settings = h('button', { class: 'icon-btn', attrs: { 'aria-label': t('settings') } }, icon('settings'));
    settings.addEventListener('click', () => this.showSettings());

    const colors = ['#ff5a6e', '#ff9a3c', '#ffd23f', '#36d982', '#3cc7ff', '#9b6bff'];
    const blocks = h('div', { class: 'blocks' });
    colors.forEach((c, i) => {
      const b = h('i');
      b.style.background = c;
      b.style.animationDelay = `${i * 0.12}s`;
      blocks.append(b);
    });

    const play = h(
      'button',
      { class: 'btn green' },
      icon('play'),
      hasSave
        ? h('span', { class: 'stack' }, h('span', { text: t('continue') }), h('span', { class: 'sub', text: formatNumber(saved!.score ?? 0) }))
        : h('span', { text: t('play') }),
    );
    play.style.minHeight = '66px';
    play.style.fontSize = '22px';
    play.addEventListener('click', () => this.startGame('classic'));

    const completed = p.daily.lastCompleted === today;
    const streak = liveDailyStreak(p, today);
    const todayBest = p.daily.bestKey === today ? p.daily.best : 0;
    const info = h('span');
    if (completed) info.append(h('span', { class: 'done', text: `✓ ${t('completed')}` }));
    else info.append(t('target', { n: formatNumber(dailyTargetFor(today)) }));
    if (todayBest > 0 && !completed) info.append(' · ' + t('todayBest', { n: formatNumber(todayBest) }));
    if (streak > 0) info.append(h('span', { class: 'flame' }, icon('fire'), String(streak)));
    const daily = h('button', { class: 'daily-card' }, h('div', { class: 'ic' }, icon('calendar')), h('div', {}, h('b', { text: t('daily') }), info));
    daily.addEventListener('click', () => this.startGame('daily'));

    const best = h('div', { class: 'best home-best' }, icon('crown'), h('span', { text: `${t('best')}: ${formatNumber(p.bestClassic)}` }));

    const home = $('home');
    home.replaceChildren(
      h('div', { class: 'home-top' }, settings, coins),
      h('div', { class: 'logo' }, blocks, h('span', { class: 'w1', text: 'BLOCK' }), h('span', { class: 'w2', text: 'NOVA' })),
      p.bestClassic > 0 ? best : '',
      h('div', { class: 'home-actions' }, play, daily),
    );
  }

  // ================================================================== game lifecycle

  private startGame(mode: Mode, fresh = false): void {
    sfx.unlock();
    this.closeModal();
    let g: Game | null = null;
    if (!fresh && this.saves[mode]) {
      g = Game.deserialize(this.saves[mode]);
      if (g && mode === 'daily' && g.dailyKey !== dateKey()) g = null;
    }
    if (!g) {
      g = Game.create(mode, { dailyKey: dateKey() });
      track('game_start', { mode });
    }
    clearTimeout(this.noMovesTimer);
    $('give-up').hidden = true;
    this.game = g;
    this.stuck = false;
    this.busy = false;
    this.screen = 'game';
    this.setTool('none');
    this.setGameChromeVisible(true);
    this.renderer.fx.clear();
    this.renderer.frozen = false;
    this.renderer.game = g;
    this.renderer.resize();
    this.renderer.dealt();
    this.shownScore = g.score;
    $('score').textContent = formatNumber(g.score);
    this.updateHud();
    this.updateHint();
    this.saveGame();
    if (!g.hasMoves()) this.scheduleNoMoves();
  }

  private place(slot: number, r: number, c: number): boolean {
    const g = this.game;
    if (!g) return false;
    const res = g.place(slot, r, c);
    if (!res) return false;

    sfx.place();
    haptic(res.lines >= 3 || res.bombs ? 'heavy' : res.lines ? 'medium' : 'light');
    if (res.lines) sfx.clear(res.lines, res.streak);
    if (res.bombs) sfx.bomb();
    if (res.gems) {
      sfx.gem();
      this.awardGems(res.gems);
    }
    if (res.feverStarted) sfx.fever();

    this.renderer.onPlace(res, this.praise(res));
    if (res.dealt) this.renderer.dealt();
    if (res.dailyReached) this.onDailyReached();

    if (!this.profile.tutorialDone) {
      this.profile.tutorialDone = true;
      this.saveProfile();
      this.updateHint();
    }
    this.updateHud();
    this.saveGame();
    this.checkMoves();
    return true;
  }

  private praise(res: PlaceResult): { main: string | null; sub: string | null } {
    const subs: string[] = [];
    if (res.feverStarted) subs.push(t('fever'));
    if (res.monoLines) subs.push(t('perfectColor'));
    if (res.lines && res.streak >= 2) subs.push(t('combo', { n: res.streak }));
    let main: string | null = null;
    if (res.allClear) main = t('allClear');
    else if (res.lines >= 5) main = t('unreal');
    else if (res.lines === 4) main = t('amazing');
    else if (res.lines === 3) main = t('great');
    else if (res.lines === 2) main = t('good');
    if (!main) main = subs.shift() ?? null;
    return { main, sub: subs.slice(0, 2).join(' · ') || null };
  }

  private awardGems(n: number): void {
    this.profile.coins += n * ECONOMY.coinsPerGem;
    this.profile.stats.gems += n;
    this.saveProfile();
    this.bump($('coins'));
  }

  private onDailyReached(): void {
    const g = this.game;
    if (!g?.dailyKey) return;
    const streak = completeDaily(this.profile, g.dailyKey);
    this.saveProfile();
    sfx.reward();
    haptic('success');
    // Let the placement banner finish first so the two never overlap.
    window.setTimeout(() => this.renderer.banner(t('dailyDone'), t('streak', { n: streak }), '#36d982'), 1000);
    track('daily_complete', { streak });
  }

  private checkMoves(): void {
    const g = this.game;
    if (!g) return;
    if (!g.hasMoves()) {
      this.scheduleNoMoves();
    } else if (this.stuck) {
      this.stuck = false;
      $('give-up').hidden = true;
      this.updateHud();
    }
  }

  private scheduleNoMoves(): void {
    clearTimeout(this.noMovesTimer);
    // Small delay so the last clear animation can play before any dialog appears.
    this.noMovesTimer = window.setTimeout(() => this.onNoMoves(), NO_MOVES_DELAY);
  }

  private onNoMoves(): void {
    const g = this.game;
    if (!g || this.screen !== 'game' || g.hasMoves()) return;
    if (this.modal) return; // closeModal() re-checks once the dialog is gone
    if (this.stuck && this.boostersCanHelp()) return;
    this.stuck = false;
    $('give-up').hidden = true;
    const canRevive = !g.revived && this.ads.rewardedReady();
    const boosterHelp = this.boostersCanHelp();
    if (!canRevive && !boosterHelp) {
      this.gameOver();
      return;
    }
    this.showNoMoves(canRevive, boosterHelp);
  }

  private boostersCanHelp(): boolean {
    const g = this.game;
    if (!g || g.mode === 'daily') return false;
    const b = this.profile.boosters;
    const cost = ECONOMY.boosterCost;
    const canRotate = (b.rotate > 0 || g.tray.some((p) => p?.rotatable)) && g.rotationHelps();
    return b.hammer > 0 || b.reroll > 0 || canRotate || this.profile.coins >= Math.min(cost.hammer, cost.reroll);
  }

  private showNoMoves(canRevive: boolean, boosterHelp: boolean): void {
    const actions = h('div', { class: 'actions' });
    if (canRevive) {
      const btn = h(
        'button',
        { class: 'btn orange' },
        icon('ad'),
        h('span', { class: 'stack' }, h('span', { text: t('revive') }), h('span', { class: 'sub', text: t('watchAd') })),
      );
      btn.addEventListener('click', () => void this.revive());
      actions.append(btn);
    }
    if (boosterHelp) {
      const btn = h('button', { class: 'btn' }, icon('hammer'), h('span', { text: t('useBooster') }));
      btn.addEventListener('click', () => this.enterStuck());
      actions.append(btn);
    }
    const finish = h('button', { class: 'btn ghost', text: t('finish') });
    finish.addEventListener('click', () => this.gameOver());
    actions.append(finish);
    this.openModal(h('div', { class: 'card' }, h('h2', { text: t('noSpace') }), actions));
  }

  private enterStuck(): void {
    this.closeModal();
    this.stuck = true;
    const gu = $('give-up');
    gu.textContent = t('giveUp');
    gu.hidden = false;
    this.updateHud();
  }

  private async revive(): Promise<void> {
    const g = this.game;
    if (!g || this.busy) return;
    if (!this.ads.rewardedReady()) {
      this.toast(t('adUnavailable'));
      return;
    }
    this.busy = true;
    const ok = await this.withAd(() => this.ads.rewarded('revive'));
    this.busy = false;
    if (!ok || this.game !== g) return;
    this.closeModal();
    const cleared = g.revive();
    const L = this.renderer.layout;
    this.renderer.animateClear(cleared, L.boardX + L.boardSize / 2, L.boardY + L.boardSize / 2);
    this.renderer.fx.shake(6, 300);
    this.renderer.dealt();
    sfx.reward();
    haptic('success');
    track('revive', {});
    this.saveGame();
    this.updateHud();
    this.checkMoves();
  }

  private gameOver(): void {
    const g = this.game;
    if (!g || this.screen !== 'game') return;
    clearTimeout(this.noMovesTimer);
    this.stuck = false;
    $('give-up').hidden = true;
    this.setTool('none');
    this.input.cancel();
    this.closeModal();

    const p = this.profile;
    const score = g.score;
    let isBest = false;
    let best: number;
    if (g.mode === 'classic') {
      isBest = score > p.bestClassic && p.bestClassic > 0;
      p.bestClassic = Math.max(p.bestClassic, score);
      best = p.bestClassic;
    } else {
      if (p.daily.bestKey !== g.dailyKey) {
        p.daily.bestKey = g.dailyKey;
        p.daily.best = score;
      } else if (score > p.daily.best) {
        isBest = true;
        p.daily.best = score;
      }
      best = p.daily.best;
    }
    const coins = g.scoreCoins();
    p.coins += coins;
    p.stats.games++;
    p.stats.lines += g.lines;
    this.saves[g.mode] = null;
    removeKey(SAVE_KEY(g.mode));
    this.saveProfile();
    this.updateHud();

    sfx.gameOver();
    haptic('heavy');
    track('game_over', { mode: g.mode, score, lines: g.lines, moves: g.moves, revived: g.revived });
    this.showGameOver(g.mode, score, best, isBest, coins);
  }

  private showGameOver(mode: Mode, score: number, best: number, isBest: boolean, coins: number): void {
    const scoreEl = h('div', { class: 'big-score', text: '0' });
    this.countUp(scoreEl, score);
    const tag = isBest
      ? h('div', { class: 'tag new' }, icon('crown'), t('newBest'))
      : h('div', { class: 'tag' }, icon('crown'), `${t('best')}: ${formatNumber(best)}`);
    const rewardText = h('span', { text: `+${coins}` });
    const reward = coins > 0 ? h('div', { class: 'reward-row' }, icon('coin'), rewardText) : null;

    const actions = h('div', { class: 'actions' });
    if (coins > 0 && this.ads.rewardedReady()) {
      const dbl = h('button', { class: 'btn orange' }, icon('ad'), h('span', { text: t('double') }));
      dbl.addEventListener('click', async () => {
        if (this.busy) return;
        this.busy = true;
        const ok = await this.withAd(() => this.ads.rewarded('double_coins'));
        this.busy = false;
        if (!ok) return;
        this.profile.coins += coins;
        this.saveProfile();
        this.updateHud();
        rewardText.textContent = `+${coins * 2}`;
        this.bump(reward!);
        sfx.reward();
        dbl.remove();
      });
      actions.append(dbl);
    }
    const again = h('button', { class: 'btn green' }, icon('restart'), h('span', { text: t('playAgain') }));
    again.addEventListener('click', () => void this.afterGameOver(() => this.startGame(mode, true)));
    const home = h('button', { class: 'btn ghost' }, icon('home'), h('span', { text: t('home') }));
    home.addEventListener('click', () => void this.afterGameOver(() => this.showHome()));
    actions.append(again, home);

    this.openModal(
      h('div', { class: 'card' }, h('h2', { text: t('gameOver') }), scoreEl, tag, reward, actions),
      () => void this.afterGameOver(() => this.showHome()),
    );
  }

  /** Natural break: the only place an interstitial may appear. */
  private async afterGameOver(next: () => void): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.withAd(() => this.ads.maybeInterstitial(this.profile.stats.games));
    } finally {
      this.busy = false;
    }
    next();
  }

  private async withAd<T>(fn: () => Promise<T>): Promise<T> {
    this.input.cancel();
    sfx.suspend();
    try {
      return await fn();
    } finally {
      sfx.resume();
    }
  }

  // ================================================================== boosters

  private activateBooster(kind: BoosterKind): void {
    const g = this.game;
    if (!g || this.modal || this.busy) return;
    if (g.mode === 'daily') {
      this.toast(t('noBoostersDaily'));
      return;
    }
    if (this.renderer.tool === kind) {
      this.setTool('none');
      return;
    }
    if (this.profile.boosters[kind] <= 0) {
      this.showBoosterShop(kind);
      return;
    }
    this.input.cancel();
    if (kind === 'reroll') {
      this.setTool('none');
      this.consumeBooster('reroll');
      g.reroll();
      this.renderer.dealt();
      sfx.pick();
      haptic('medium');
      this.saveGame();
      this.checkMoves();
    } else if (kind === 'rotate') {
      this.setTool('rotate');
      this.toast(t('pickRotate'), 0);
    } else {
      this.setTool('hammer');
      this.toast(t('pickHammer'), 0);
    }
  }

  private consumeBooster(kind: BoosterKind): boolean {
    if (this.profile.boosters[kind] <= 0) return false;
    this.profile.boosters[kind]--;
    this.saveProfile();
    this.updateHud();
    track('booster_used', { kind });
    return true;
  }

  private rotateTool(slot: number): void {
    const g = this.game;
    const piece = g?.tray[slot];
    if (!g || !piece) return;
    this.setTool('none');
    if (piece.rotatable || !this.consumeBooster('rotate')) return;
    g.makeRotatable(slot);
    g.rotatePiece(slot);
    sfx.pick();
    haptic('light');
    this.toast(t('tapToRotate'));
    this.saveGame();
    this.renderer.invalidate();
    this.checkMoves();
  }

  private rotateTap(slot: number): void {
    const g = this.game;
    if (!g || !g.rotatePiece(slot)) return;
    sfx.pick();
    haptic('light');
    this.saveGame();
    this.renderer.invalidate();
    this.checkMoves();
  }

  private hammer(r: number, c: number): void {
    const g = this.game;
    if (!g || this.renderer.tool !== 'hammer') return;
    if (this.profile.boosters.hammer <= 0) {
      this.setTool('none');
      return;
    }
    const cleared: ClearedCell[] = g.hammer(r, c);
    if (!cleared.length) {
      sfx.invalid();
      return;
    }
    this.consumeBooster('hammer');
    this.setTool('none');
    const L = this.renderer.layout;
    const x = L.gridX + (c + 0.5) * L.cell;
    const y = L.gridY + (r + 0.5) * L.cell;
    this.renderer.animateClear(cleared, x, y);
    this.renderer.shockwave(x, y, L.cell * 2, '#ff8a9a');
    this.renderer.fx.shake(7, 280);
    sfx.smash();
    haptic('heavy');
    const gems = cleared.filter((cc) => cc.special === Special.Gem).length;
    if (gems) this.awardGems(gems);
    this.saveGame();
    this.updateHud();
    this.checkMoves();
  }

  private setTool(mode: ToolMode): void {
    this.renderer.tool = mode;
    this.renderer.hammerTarget = null;
    for (const kind of BOOSTERS) this.boosterEls[kind]?.btn.classList.toggle('active', kind === mode);
    if (mode === 'none') this.hideToast();
    this.renderer.invalidate();
  }

  private showBoosterShop(kind: BoosterKind): void {
    const cost = ECONOMY.boosterCost[kind];
    const buy = h(
      'button',
      { class: 'btn' },
      h('span', { text: t('buy') }),
      h('span', { class: 'price' }, icon('coin'), String(cost)),
    );
    if (this.profile.coins < cost) buy.setAttribute('disabled', '');
    buy.addEventListener('click', () => {
      if (this.profile.coins < cost) {
        this.toast(t('notEnoughCoins'));
        return;
      }
      this.profile.coins -= cost;
      this.profile.boosters[kind]++;
      this.saveProfile();
      this.updateHud();
      track('booster_bought', { kind, cost });
      sfx.reward();
      this.closeModal();
    });
    const free = h('button', { class: 'btn orange' }, icon('ad'), h('span', { text: t('free') }));
    if (!this.ads.rewardedReady()) free.setAttribute('disabled', '');
    free.addEventListener('click', async () => {
      if (this.busy) return;
      this.busy = true;
      const ok = await this.withAd(() => this.ads.rewarded(`booster_${kind}`));
      this.busy = false;
      if (!ok) return;
      this.profile.boosters[kind]++;
      this.saveProfile();
      this.updateHud();
      sfx.reward();
      this.closeModal();
    });
    const close = h('button', { class: 'btn ghost', text: t('close') });
    close.addEventListener('click', () => this.closeModal());
    this.openModal(
      h(
        'div',
        { class: 'card' },
        h('div', { class: 'booster-hero' }, icon(BOOSTER_ICON[kind])),
        h('h2', { text: t(kind) }),
        h('p', { text: t(BOOSTER_DESC[kind]) }),
        h('div', { class: 'actions' }, buy, free, close),
      ),
      () => this.closeModal(),
    );
  }

  // ================================================================== pause & settings

  private showPause(): void {
    if (this.screen !== 'game' || this.modal || !this.game) return;
    this.input.cancel();
    this.setTool('none');
    const resume = h('button', { class: 'btn green' }, icon('play'), h('span', { text: t('resume') }));
    resume.addEventListener('click', () => this.closeModal());
    const restart = h('button', { class: 'btn' }, icon('restart'), h('span', { text: t('restart') }));
    restart.addEventListener('click', () => {
      const mode = this.game?.mode ?? 'classic';
      track('restart', { mode });
      this.startGame(mode, true);
    });
    const home = h('button', { class: 'btn ghost' }, icon('home'), h('span', { text: t('home') }));
    home.addEventListener('click', () => this.showHome());
    this.openModal(
      h('div', { class: 'card' }, h('h2', { text: t('paused') }), this.settingRows(false), h('div', { class: 'actions' }, resume, restart, home)),
      () => this.closeModal(),
    );
  }

  private showSettings(): void {
    const close = h('button', { class: 'btn ghost', text: t('close') });
    close.addEventListener('click', () => this.closeModal());
    this.openModal(
      h(
        'div',
        { class: 'card' },
        h('h2', { text: t('settings') }),
        this.settingRows(true),
        h('div', { class: 'small', text: `Block Nova · ${t('version')} ${APP_VERSION}` }),
        h('div', { class: 'actions' }, close),
      ),
      () => this.closeModal(),
    );
  }

  private settingRows(full: boolean): HTMLElement {
    const p = this.profile;
    const toggle = (on: boolean, set: (v: boolean) => void) => {
      const b = h('button', { class: `toggle${on ? ' on' : ''}`, attrs: { role: 'switch', 'aria-checked': String(on) } });
      b.addEventListener('click', () => {
        const v = !b.classList.contains('on');
        b.classList.toggle('on', v);
        b.setAttribute('aria-checked', String(v));
        set(v);
        this.saveProfile();
      });
      return b;
    };
    const row = (ic: IconName, label: string, control: HTMLElement) =>
      h('div', { class: 'setting-row' }, h('span', { class: 'label' }, icon(ic), label), control);

    const box = h(
      'div',
      {},
      row('sound', t('sound'), toggle(p.settings.sound, (v) => {
        p.settings.sound = v;
        sfx.enabled = v;
        this.ads.setMuted(!v);
      })),
      row('vibrate', t('haptics'), toggle(p.settings.haptics, (v) => {
        p.settings.haptics = v;
        setHapticsEnabled(v);
        if (v) haptic('medium');
      })),
    );
    if (full) {
      const seg = h('div', { class: 'seg' });
      (Object.keys(LANG_NAMES) as Lang[]).forEach((l) => {
        const b = h('button', { class: getLang() === l ? 'on' : '', text: l.toUpperCase(), attrs: { 'aria-label': LANG_NAMES[l] } });
        b.addEventListener('click', () => {
          p.settings.lang = l;
          setLang(l);
          this.saveProfile();
          this.renderHome();
          this.showSettings();
        });
        seg.append(b);
      });
      box.append(row('globe', t('language'), seg));
      if (this.ads.privacyOptionsRequired()) {
        const b = h('button', { class: 'btn ghost', text: '›' });
        b.style.width = '56px';
        b.style.minHeight = '40px';
        b.addEventListener('click', () => void this.ads.showPrivacyOptions());
        box.append(row('shield', t('privacy'), b));
      }
    }
    return box;
  }

  // ================================================================== HUD

  private updateHud(): void {
    const g = this.game;
    const p = this.profile;
    ($('coins').lastElementChild as HTMLElement).textContent = formatNumber(p.coins);
    if (!g) return;

    if (g.score !== Math.round(this.shownScore)) this.animateScore(g.score);
    let best: number;
    if (g.mode === 'classic') best = Math.max(p.bestClassic, g.score);
    else best = p.daily.bestKey === g.dailyKey ? Math.max(p.daily.best, g.score) : g.score;
    ($('best').lastElementChild as HTMLElement).textContent = formatNumber(best);

    const chip = $('chip');
    const text = g.fever ? t('fever') : g.streak >= 2 ? t('combo', { n: g.streak }) : '';
    if (chip.textContent !== text) {
      chip.textContent = text;
      chip.classList.toggle('fever', g.fever);
      chip.hidden = !text;
    }

    const bar = $('daily-bar');
    bar.hidden = g.mode !== 'daily' || !!text;
    if (g.mode === 'daily') {
      (bar.querySelector('.fill') as HTMLElement).style.width = `${Math.min(100, (g.score / g.dailyTarget) * 100)}%`;
      (bar.querySelector('.label') as HTMLElement).textContent = g.dailyReached
        ? `✓ ${t('dailyDone')}`
        : `${formatNumber(g.score)} / ${formatNumber(g.dailyTarget)}`;
      bar.classList.toggle('done', g.dailyReached);
    }

    for (const kind of BOOSTERS) {
      const { btn, badge } = this.boosterEls[kind];
      const n = p.boosters[kind];
      btn.classList.toggle('disabled', g.mode === 'daily');
      btn.classList.toggle('pulse', this.stuck && (n > 0 || p.coins >= ECONOMY.boosterCost[kind]));
      badge.textContent = n > 0 ? String(n) : '+';
      badge.classList.toggle('plus', n <= 0);
    }
  }

  private animateScore(target: number): void {
    const el = $('score');
    const from = this.shownScore;
    const start = performance.now();
    cancelAnimationFrame(this.scoreRaf);
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 380);
      this.shownScore = from + (target - from) * (1 - Math.pow(1 - k, 3));
      el.textContent = formatNumber(this.shownScore);
      if (k < 1) this.scoreRaf = requestAnimationFrame(step);
    };
    this.scoreRaf = requestAnimationFrame(step);
    if (target > from) this.bump(el);
  }

  private countUp(el: HTMLElement, target: number): void {
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 900);
      el.textContent = formatNumber(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  private bump(el: HTMLElement): void {
    el.classList.remove('bump');
    void el.offsetWidth; // restart the CSS animation
    el.classList.add('bump');
  }

  private updateHint(): void {
    const hint = $('hint');
    const show = this.screen === 'game' && !!this.game && !this.profile.tutorialDone;
    hint.hidden = !show;
    if (!show || !this.renderer.layout) return;
    hint.textContent = t('tutorial');
    hint.style.top = `${Math.max(0, this.renderer.layout.trayY - 46)}px`;
  }

  private toast(msg: string, ms = 1800): void {
    const el = $('toast');
    clearTimeout(this.toastTimer);
    el.textContent = msg;
    el.hidden = false;
    // Re-trigger the entrance animation.
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    if (ms > 0) this.toastTimer = window.setTimeout(() => this.hideToast(), ms);
  }

  private hideToast(): void {
    clearTimeout(this.toastTimer);
    $('toast').hidden = true;
  }

  // ================================================================== modal

  private openModal(card: HTMLElement, onBack?: () => void): void {
    this.closeModal();
    this.input.cancel();
    const el = h('div', { class: 'backdrop' }, card);
    $('layer').append(el);
    this.modal = { el, onBack };
    this.renderer.frozen = true;
  }

  private closeModal(): void {
    if (!this.modal) return;
    this.modal.el.remove();
    this.modal = null;
    this.renderer.frozen = false;
    this.renderer.invalidate();
    if (this.screen === 'game' && this.game && !this.stuck && !this.game.hasMoves()) this.scheduleNoMoves();
  }

  // ================================================================== persistence & platform

  private saveGame(): void {
    const g = this.game;
    if (!g) return;
    const data = g.serialize();
    this.saves[g.mode] = data;
    saveJSON(SAVE_KEY(g.mode), data);
  }

  private saveProfile(): void {
    saveJSON('profile', this.profile);
  }

  /** Android back button. Returns false when the app should exit. */
  onBack(): boolean {
    if (this.modal) {
      this.modal.onBack?.();
      return true;
    }
    if (this.screen === 'game') {
      if (this.renderer.tool !== 'none') this.setTool('none');
      else this.showPause();
      return true;
    }
    return false;
  }

  onPause(): void {
    this.input.cancel();
    // On Android a full-screen ad is its own Activity and triggers a pause; never stack a pause dialog on an ad flow.
    if (this.screen === 'game' && !this.modal && !this.busy && this.game) this.showPause();
    this.saveGame();
    sfx.suspend();
    void flushStorage();
  }

  onResume(): void {
    sfx.resume();
  }
}
