import type Phaser from 'phaser';
import cheetah from '../assets/rivals/cheetah.webp';
import falcon from '../assets/rivals/falcon.webp';
import fox from '../assets/rivals/fox.webp';
import gazelle from '../assets/rivals/gazelle.webp';
import lion from '../assets/rivals/lion.webp';
import penguin from '../assets/rivals/penguin.webp';
import rabbit from '../assets/rivals/rabbit.webp';
import sloth from '../assets/rivals/sloth.webp';
import turtle from '../assets/rivals/turtle.webp';
import wolf from '../assets/rivals/wolf.webp';

/** Rival portraits by the creative director, keyed by rival id. */
const PORTRAITS: Record<string, string> = { turtle, sloth, penguin, rabbit, fox, wolf, lion, gazelle, cheetah, falcon };

export function portraitKey(rivalId: string): string {
  return `portrait_${rivalId}`;
}

/** Queues the portraits for loading. Call from a scene's preload(). */
export function preloadPortraits(scene: Phaser.Scene): void {
  for (const [id, url] of Object.entries(PORTRAITS)) {
    if (!scene.textures.exists(portraitKey(id))) scene.load.image(portraitKey(id), url);
  }
}
