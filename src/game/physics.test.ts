import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkCircleRectCollision,
  calculatePaddleBounce,
  calculateScore,
  getExplosionAffectedBricks,
  generateStageBricks,
  clamp
} from './physics.js';

test('clamp restricts values to min and max boundaries', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(15, 0, 10), 10);
});

test('checkCircleRectCollision detects hits and misses accurately', () => {
  const rect = { x: 100, y: 100, width: 60, height: 20 };

  // Ball clearly outside
  const miss = checkCircleRectCollision({ x: 50, y: 50, radius: 10 }, rect);
  assert.equal(miss.collided, false);

  // Ball colliding with top edge
  const hitTop = checkCircleRectCollision({ x: 130, y: 95, radius: 8 }, rect);
  assert.equal(hitTop.collided, true);
  assert.ok(hitTop.depth > 0);

  // Ball colliding with left edge
  const hitLeft = checkCircleRectCollision({ x: 95, y: 110, radius: 8 }, rect);
  assert.equal(hitLeft.collided, true);
});

test('calculatePaddleBounce angles ball depending on hit location', () => {
  const paddle = { x: 100, y: 500, width: 100, height: 16, vx: 0 };

  // Center hit -> ball rebounds straight up
  const centerBall = { x: 150, y: 495, vx: 0, vy: 300, radius: 8, speed: 300 };
  const centerBounce = calculatePaddleBounce(centerBall, paddle);
  assert.ok(centerBounce.vy < 0, 'Ball should travel upward');
  assert.ok(Math.abs(centerBounce.vx) < 30, 'Center hit has minimal horizontal angle');

  // Right edge hit -> ball angles right
  const rightBall = { x: 190, y: 495, vx: 0, vy: 300, radius: 8, speed: 300 };
  const rightBounce = calculatePaddleBounce(rightBall, paddle);
  assert.ok(rightBounce.vx > 50, 'Right hit should produce positive vx');
  assert.ok(rightBounce.vy < 0, 'Ball must bounce upward');

  // Left edge hit -> ball angles left
  const leftBall = { x: 110, y: 495, vx: 0, vy: 300, radius: 8, speed: 300 };
  const leftBounce = calculatePaddleBounce(leftBall, paddle);
  assert.ok(leftBounce.vx < -50, 'Left hit should produce negative vx');
  assert.ok(leftBounce.vy < 0, 'Ball must bounce upward');
});

test('calculateScore scales with combo multipliers', () => {
  assert.equal(calculateScore(100, 1), 100);
  assert.equal(calculateScore(100, 2), 120);
  assert.equal(calculateScore(100, 5), 180);
});

test('getExplosionAffectedBricks identifies nearby bricks in blast radius', () => {
  const bomb = { id: 1, x: 100, y: 100, width: 40, height: 20, alive: true };
  const near1 = { id: 2, x: 145, y: 100, width: 40, height: 20, alive: true };
  const far1 = { id: 3, x: 300, y: 300, width: 40, height: 20, alive: true };
  const deadNear = { id: 4, x: 100, y: 125, width: 40, height: 20, alive: false };

  const affected = getExplosionAffectedBricks(bomb, [bomb, near1, far1, deadNear], 80);
  assert.equal(affected.length, 1);
  assert.equal(affected[0].id, 2);
});

test('generateStageBricks creates a valid level layout with target bricks', () => {
  const stage = generateStageBricks(0, 800, 600);
  assert.ok(stage.bricks.length > 0);
  assert.ok(stage.targetCount > 0);
  assert.ok(stage.name.length > 0);
});
