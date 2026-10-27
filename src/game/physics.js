/**
 * Pure physics & logic functions for Breakout Game (打磚塊)
 * Decoupled from DOM and Canvas rendering for fast deterministic testing.
 */

export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Circle to axis-aligned rectangle collision check
 * @param {{x: number, y: number, radius: number}} circle 
 * @param {{x: number, y: number, width: number, height: number}} rect 
 * @returns {{collided: boolean, normalX: number, normalY: number, depth: number}}
 */
export function checkCircleRectCollision(circle, rect) {
  // Find closest point on rectangle to circle center
  const closestX = clamp(circle.x, rect.x, rect.x + rect.width);
  const closestY = clamp(circle.y, rect.y, rect.y + rect.height);

  const distX = circle.x - closestX;
  const distY = circle.y - closestY;
  const distSquared = distX * distX + distY * distY;

  if (distSquared > circle.radius * circle.radius) {
    return { collided: false, normalX: 0, normalY: 0, depth: 0 };
  }

  const dist = Math.sqrt(distSquared);
  let normalX = 0;
  let normalY = 0;
  let depth = 0;

  if (dist > 0.0001) {
    normalX = distX / dist;
    normalY = distY / dist;
    depth = circle.radius - dist;
  } else {
    // Circle center is inside the rectangle; resolve to closest edge
    const leftDist = Math.abs(circle.x - rect.x);
    const rightDist = Math.abs(rect.x + rect.width - circle.x);
    const topDist = Math.abs(circle.y - rect.y);
    const bottomDist = Math.abs(rect.y + rect.height - circle.y);

    const minEdge = Math.min(leftDist, rightDist, topDist, bottomDist);
    if (minEdge === topDist) {
      normalY = -1;
      depth = circle.radius + topDist;
    } else if (minEdge === bottomDist) {
      normalY = 1;
      depth = circle.radius + bottomDist;
    } else if (minEdge === leftDist) {
      normalX = -1;
      depth = circle.radius + leftDist;
    } else {
      normalX = 1;
      depth = circle.radius + rightDist;
    }
  }

  return { collided: true, normalX, normalY, depth };
}

/**
 * Calculate reflection velocity when ball hits paddle
 * Adjusts angle based on offset from center and paddle horizontal speed (spin)
 * @param {{x: number, y: number, vx: number, vy: number, radius: number, speed: number}} ball 
 * @param {{x: number, y: number, width: number, height: number, vx?: number}} paddle 
 * @returns {{vx: number, vy: number}}
 */
export function calculatePaddleBounce(ball, paddle) {
  const paddleCenter = paddle.x + paddle.width / 2;
  // hitRatio: -1 (far left) to 1 (far right)
  let hitRatio = (ball.x - paddleCenter) / (paddle.width / 2);
  hitRatio = clamp(hitRatio, -0.92, 0.92);

  // Maximum bounce angle from vertical: ~60 degrees (1.05 radians)
  const maxBounceAngle = Math.PI * 0.35;
  const bounceAngle = hitRatio * maxBounceAngle;

  const currentSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) || ball.speed || 400;
  // Apply a slight English / paddle movement influence if paddle is moving
  const paddleInfluence = (paddle.vx || 0) * 0.15;

  let newVx = Math.sin(bounceAngle) * currentSpeed + paddleInfluence;
  let newVy = -Math.cos(bounceAngle) * currentSpeed;

  // Re-normalize to preserve speed
  const newMag = Math.sqrt(newVx * newVx + newVy * newVy);
  if (newMag > 0) {
    newVx = (newVx / newMag) * currentSpeed;
    newVy = (newVy / newMag) * currentSpeed;
  }

  // Ensure minimum upward velocity so ball never bounces purely horizontally
  if (newVy > -currentSpeed * 0.35) {
    newVy = -currentSpeed * 0.35;
    const remainingMag = Math.sqrt(Math.max(0, currentSpeed * currentSpeed - newVy * newVy));
    newVx = (newVx >= 0 ? 1 : -1) * remainingMag;
  }

  return { vx: newVx, vy: newVy };
}

/**
 * Score calculation with combo multiplier
 */
export function calculateScore(basePoints, combo = 1, difficultyMultiplier = 1) {
  const comboMult = Math.min(5, 1 + (combo - 1) * 0.2);
  return Math.round(basePoints * comboMult * difficultyMultiplier);
}

/**
 * Return indices or IDs of bricks affected by a bomb explosion
 */
export function getExplosionAffectedBricks(bombBrick, allBricks, radius = 90) {
  const bombCenterX = bombBrick.x + bombBrick.width / 2;
  const bombCenterY = bombBrick.y + bombBrick.height / 2;

  const affected = [];
  for (let i = 0; i < allBricks.length; i++) {
    const brick = allBricks[i];
    if (!brick.alive || brick.id === bombBrick.id) continue;

    const brickCenterX = brick.x + brick.width / 2;
    const brickCenterY = brick.y + brick.height / 2;
    const dx = brickCenterX - bombCenterX;
    const dy = brickCenterY - bombCenterY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= radius) {
      affected.push(brick);
    }
  }
  return affected;
}

/**
 * Stage layout configurations (Levels 1 to 5)
 */
export const STAGE_PATTERNS = [
  // Stage 1: Classic Rainbow
  {
    name: "霓虹初現 (Neon Classic)",
    rows: 5,
    cols: 8,
    layout: [
      "11111111",
      "22222222",
      "33G33G33",
      "44444444",
      "55555555"
    ]
  },
  // Stage 2: Fortress & Bombs
  {
    name: "爆破要塞 (Explosive Fortress)",
    rows: 6,
    cols: 8,
    layout: [
      "22222222",
      "2B1111B2",
      "21G22G12",
      "111MM111",
      "33B11B33",
      " 444444 "
    ]
  },
  // Stage 3: Space Invader Grid
  {
    name: "入侵矩陣 (Invader Matrix)",
    rows: 7,
    cols: 8,
    layout: [
      " 11  11 ",
      "  1111  ",
      " 111111 ",
      "11B11B11",
      "11111111",
      "1 1  1 1",
      "  G  G  "
    ]
  },
  // Stage 4: Diamond Shield
  {
    name: "金剛石之壁 (Diamond Wall)",
    rows: 7,
    cols: 8,
    layout: [
      "   22   ",
      "  2M M2  ",
      " 2MBBM2 ",
      "2MG11GM2",
      " 2MBBM2 ",
      "  2M M2  ",
      "   22   "
    ]
  },
  // Stage 5: Master Core (Boss level)
  {
    name: "終極核心 (Quantum Core)",
    rows: 8,
    cols: 8,
    layout: [
      "MMMMMMMM",
      "M333333M",
      "M3BBBB3M",
      "M3BGGB3M",
      "M3BGGB3M",
      "M3BBBB3M",
      "M333333M",
      " 11  11 "
    ]
  }
];

/**
 * Generate bricks for a stage
 */
export function generateStageBricks(stageIndex, canvasWidth, canvasHeight) {
  const pattern = STAGE_PATTERNS[stageIndex % STAGE_PATTERNS.length];
  const cols = pattern.cols;
  const rows = pattern.rows;

  const paddingX = 8;
  const paddingY = 8;
  const totalPaddingX = (cols + 1) * paddingX;
  const availableWidth = canvasWidth - totalPaddingX;
  const brickWidth = Math.floor(availableWidth / cols);
  const brickHeight = 24;
  const offsetTop = 70;
  const offsetLeft = Math.floor((canvasWidth - (cols * brickWidth + (cols - 1) * paddingX)) / 2);

  const bricks = [];
  let brickId = 0;

  for (let r = 0; r < rows; r++) {
    const rowStr = pattern.layout[r] || "";
    for (let c = 0; c < cols; c++) {
      const char = rowStr[c] || " ";
      if (char === " ") continue;

      let type = "normal";
      let hp = 1;
      let maxHp = 1;
      let points = 50;
      let color = "#3b82f6"; // default blue

      if (char === "1") {
        type = "normal";
        hp = 1;
        points = 50;
        color = "#06b6d4"; // cyan
      } else if (char === "2") {
        type = "normal";
        hp = 1;
        points = 60;
        color = "#10b981"; // emerald
      } else if (char === "3") {
        type = "sturdy";
        hp = 2;
        maxHp = 2;
        points = 120;
        color = "#f59e0b"; // amber
      } else if (char === "4") {
        type = "sturdy";
        hp = 3;
        maxHp = 3;
        points = 200;
        color = "#ec4899"; // pink
      } else if (char === "5") {
        type = "normal";
        hp = 1;
        points = 80;
        color = "#8b5cf6"; // violet
      } else if (char === "B") {
        type = "bomb";
        hp = 1;
        points = 150;
        color = "#ef4444"; // red explosive
      } else if (char === "G") {
        type = "gift";
        hp = 1;
        points = 100;
        color = "#eab308"; // gold gift
      } else if (char === "M") {
        type = "metal";
        hp = 999;
        maxHp = 999;
        points = 0;
        color = "#64748b"; // slate steel
      }

      const x = offsetLeft + c * (brickWidth + paddingX);
      const y = offsetTop + r * (brickHeight + paddingY);

      bricks.push({
        id: ++brickId,
        row: r,
        col: c,
        x,
        y,
        width: brickWidth,
        height: brickHeight,
        type,
        hp,
        maxHp,
        points,
        color,
        alive: true
      });
    }
  }

  return {
    name: pattern.name,
    bricks,
    targetCount: bricks.filter(b => b.type !== "metal").length
  };
}
