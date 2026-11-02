<?php
/**
 * MiniCraft — шаблон простой игры в стиле Minecraft.
 * PHP генерирует карту мира (двумерный массив блоков) и передаёт её в JS через JSON.
 */

declare(strict_types=1);

const WORLD_WIDTH  = 40;   // ширина мира в блоках
const WORLD_HEIGHT = 24;   // высота мира в блоках
const SURFACE_BASE = 14;   // базовый уровень поверхности

// Типы блоков: id => имя (для хотбара и подсказок)
const BLOCKS = [
    0 => 'air',        // воздух
    1 => 'grass',      // трава
    2 => 'dirt',       // земля
    3 => 'stone',      // камень
    4 => 'wood',       // дерево (бревно)
    5 => 'leaves',     // листва
    6 => 'sand',       // песок
    7 => 'water',      // вода
    8 => 'plank',      // доски
    9 => 'brick',      // кирпич
];

/**
 * Простой детерминированный генератор мира:
 * холмы (синусоида + псевдослучайный шум), деревья, озеро, песчаный берег.
 */
function generateWorld(int $w, int $h): array
{
    // Детерминированный "шум" (линейный конгруэнтный генератор)
    $seed = 1337;
    $rand = function () use (&$seed): float {
        $seed = ($seed * 1103515245 + 12345) % 2147483648;
        return $seed / 2147483648;
    };

    $world = array_fill(0, $h, array_fill(0, $w, 0));

    // Рельеф: высота поверхности для каждого столбца
    $heights = [];
    for ($x = 0; $x < $w; $x++) {
        $hgt = SURFACE_BASE
             + (int)round(2.5 * sin($x / 5.0))
             + (int)round(1.5 * sin($x / 2.3 + 1.7));
        $heights[$x] = max(4, min($h - 3, $hgt));
    }

    // Заполнение слоёв: трава / земля / камень
    for ($x = 0; $x < $w; $x++) {
        $surface = $heights[$x];
        for ($y = 0; $y < $h; $y++) {
            if ($y < $surface) {
                $world[$y][$x] = 0;               // воздух
            } elseif ($y === $surface) {
                $world[$y][$x] = 1;               // трава
            } elseif ($y <= $surface + 3) {
                $world[$y][$x] = 2;               // земля
            } else {
                $world[$y][$x] = 3;               // камень
            }
        }
    }

    // Озеро: немного воды + песчаные берега
    $lakeX = (int)($w * 0.62);
    $lakeW = 7;
    for ($x = $lakeX; $x < $lakeX + $lakeW && $x < $w; $x++) {
        $surface = $heights[$x];
        $depth = 3 - abs($x - ($lakeX + intdiv($lakeW, 2)));
        if ($depth < 1) $depth = 1;
        for ($y = $surface; $y < $surface + $depth && $y < $h; $y++) {
            $world[$y][$x] = 7;                  // вода
        }
        // Песок по краям озера
        if ($x === $lakeX || $x === $lakeX + $lakeW - 1) {
            $world[$surface][$x] = 6;
            if ($surface + 1 < $h) $world[$surface + 1][$x] = 6;
        }
    }

    // Деревья
    for ($i = 0; $i < 6; $i++) {
        $tx = 3 + (int)($rand() * ($w - 6));
        $ty = $heights[$tx];
        if ($world[$ty][$tx] !== 1) continue; // только на траве
        $trunkH = 3 + (int)($rand() * 2);
        for ($j = 1; $j <= $trunkH; $j++) {
            if ($ty - $j >= 0) $world[$ty - $j][$tx] = 4; // ствол
        }
        // Крона
        for ($dy = -2; $dy <= -1; $dy++) {
            for ($dx = -1; $dx <= 1; $dx++) {
                $yy = $ty - $trunkH + $dy;
                $xx = $tx + $dx;
                if ($yy >= 0 && $xx >= 0 && $xx < $w && $world[$yy][$xx] === 0) {
                    $world[$yy][$xx] = 5;
                }
            }
        }
        if ($ty - $trunkH - 3 >= 0) $world[$ty - $trunkH - 3][$tx] = 5;
    }

    return $world;
}

$world = generateWorld(WORLD_WIDTH, WORLD_HEIGHT);

// Игрок появляется на поверхности, ближе к левому краю
$spawnX = 2;
$spawnY = 0;
for ($y = 0; $y < WORLD_HEIGHT; $y++) {
    if ($world[$y][$spawnX] !== 0) { $spawnY = $y - 1; break; }
}

$gameConfig = [
    'world'       => $world,
    'blocks'      => BLOCKS,
    'worldWidth'  => WORLD_WIDTH,
    'worldHeight' => WORLD_HEIGHT,
    'spawn'       => ['x' => $spawnX, 'y' => $spawnY],
    'inventory'   => ['plank' => 32, 'brick' => 16, 'wood' => 16, 'sand' => 16],
];
?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MiniCraft — 2D песочница</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <header class="hud-top">
        <h1>⛏ MiniCraft <span class="subtitle">2D-песочница в стиле Minecraft</span></h1>
        <div class="stats">
            <span id="pos-display">X: 0, Y: 0</span>
            <span id="fps-display">FPS: --</span>
        </div>
    </header>

    <main>
        <canvas id="game-canvas" width="960" height="576"></canvas>

        <div id="hotbar" class="hotbar"><!-- заполняется из JS --></div>

        <section class="help">
            <p><strong>Управление:</strong>
                A/D или ←/→ — ходьба, W/↑/Пробел — прыжок,
                ЛКМ — сломать блок, ПКМ — поставить блок,
                1–6 — выбор блока, колесо мыши — листать хотбар.
            </p>
        </section>
    </main>

    <!-- Конфигурация мира из PHP -->
    <script id="game-config" type="application/json"><?= json_encode($gameConfig, JSON_UNESCAPED_UNICODE) ?></script>
    <script src="game.js"></script>
</body>
</html>
