"use client";

import { useState, useEffect, useCallback } from "react";
import { Piece } from "@/utils/types";

// Define the game constants
const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 20;
const EMPTY_CELL = 0;
const SCORE_THRESHOLD = 500; // Score needed to trigger completion

// Define tetromino shapes
const SHAPES = [
    [[1, 1, 1, 1]], // I
    [
        [1, 1],
        [1, 1],
    ], // O
    [
        [0, 1, 0],
        [1, 1, 1],
    ], // T
    [
        [1, 1, 0],
        [0, 1, 1],
    ], // Z
    [
        [0, 1, 1],
        [1, 1, 0],
    ], // S
    [
        [1, 0, 0],
        [1, 1, 1],
    ], // J
    [
        [0, 0, 1],
        [1, 1, 1],
    ], // L
];

// Define colors for each shape
const COLORS = [
    "#00F0F0",
    "#F0F000",
    "#A000F0",
    "#F00000",
    "#00F000",
    "#0000F0",
    "#F0A000",
];

interface TetrisGameProps {
    onGameComplete?: () => void;
}

export default function TetrisGame({ onGameComplete }: TetrisGameProps) {
    // Create empty board
    const createEmptyBoard = () =>
        Array.from({ length: BOARD_HEIGHT }, () =>
            Array(BOARD_WIDTH).fill(EMPTY_CELL)
        );

    const [board, setBoard] = useState<number[][]>(createEmptyBoard());
    const [currentPiece, setCurrentPiece] = useState<Piece>({
        shape: SHAPES[0],
        x: 4,
        y: 0,
        color: 0,
    });
    const [score, setScore] = useState(0);
    const [gameOver, setGameOver] = useState(false);
    const [gameStarted, setGameStarted] = useState(false);
    const [completionCalled, setCompletionCalled] = useState(false);
    const [timeRemaining, setTimeRemaining] = useState(120); // Changed from 10 to 120 seconds (2 minutes)

    // Generate a random piece
    const getRandomPiece = useCallback((): Piece => {
        const shapeIndex = Math.floor(Math.random() * SHAPES.length);
        return {
            shape: SHAPES[shapeIndex],
            x: Math.floor((BOARD_WIDTH - SHAPES[shapeIndex][0].length) / 2),
            y: 0,
            color: shapeIndex,
        };
    }, []);

    // Check if the current position is valid
    const isValidMove = useCallback(
        (piece: Piece, boardToCheck: number[][]) => {
            return piece.shape.every((row, dy) => {
                return row.every((value, dx) => {
                    const x = piece.x + dx;
                    const y = piece.y + dy;
                    return (
                        value === 0 || // Empty space in tetromino
                        (x >= 0 &&
                            x < BOARD_WIDTH &&
                            y >= 0 &&
                            y < BOARD_HEIGHT &&
                            boardToCheck[y][x] === EMPTY_CELL)
                    );
                });
            });
        },
        []
    );

    // Add the current piece to the board
    const addPieceToBoard = useCallback(
        (piece: Piece, boardToUpdate: number[][]) => {
            const newBoard = boardToUpdate.map((row) => [...row]);
            piece.shape.forEach((row, dy) => {
                row.forEach((value, dx) => {
                    if (value !== 0) {
                        const y = piece.y + dy;
                        const x = piece.x + dx;
                        if (y >= 0 && y < BOARD_HEIGHT) {
                            newBoard[y][x] = piece.color + 1; // +1 so it's not 0 (empty)
                        }
                    }
                });
            });
            return newBoard;
        },
        []
    );

    // Check for completed rows and update score
    const clearRows = useCallback((boardToCheck: number[][]) => {
        const newBoard = boardToCheck.filter((row) =>
            row.some((cell) => cell === EMPTY_CELL)
        );
        const clearedRows = BOARD_HEIGHT - newBoard.length;

        // Add empty rows at the top
        while (newBoard.length < BOARD_HEIGHT) {
            newBoard.unshift(Array(BOARD_WIDTH).fill(EMPTY_CELL));
        }

        return { newBoard, rowsCleared: clearedRows };
    }, []);

    // Move the current piece
    const movePiece = useCallback(
        (dx: number, dy: number, rotate = false) => {
            if (gameOver || !gameStarted) return;

            let newPiece = {
                ...currentPiece,
                x: currentPiece.x + dx,
                y: currentPiece.y + dy,
            };

            if (rotate) {
                // Transpose and reverse to rotate 90 degrees
                const shape = currentPiece.shape[0]
                    .map((_, i) => currentPiece.shape.map((row) => row[i]))
                    .map((row) => [...row].reverse());

                newPiece = { ...newPiece, shape };
            }

            if (isValidMove(newPiece, board)) {
                setCurrentPiece(newPiece);
            } else if (dy > 0) {
                // Hit something while moving down
                const newBoard = addPieceToBoard(currentPiece, board);
                const { newBoard: clearedBoard, rowsCleared } =
                    clearRows(newBoard);

                setBoard(clearedBoard);

                // Update score and check if threshold reached
                const newScore = score + rowsCleared * 100;
                setScore(newScore);

                const nextPiece = getRandomPiece();

                if (!isValidMove(nextPiece, clearedBoard)) {
                    setGameOver(true);
                } else {
                    setCurrentPiece(nextPiece);
                }
            }
        },
        [
            board,
            currentPiece,
            gameOver,
            gameStarted,
            isValidMove,
            addPieceToBoard,
            clearRows,
            getRandomPiece,
            score,
        ]
    );

    // Drop the piece faster
    const dropPiece = useCallback(() => {
        movePiece(0, 1);
    }, [movePiece]);

    // Handle keyboard input
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!gameStarted || gameOver) return;

            switch (e.key) {
                case "ArrowLeft":
                    movePiece(-1, 0);
                    break;
                case "ArrowRight":
                    movePiece(1, 0);
                    break;
                case "ArrowDown":
                    movePiece(0, 1);
                    break;
                case "ArrowUp":
                    movePiece(0, 0, true); // rotate
                    break;
                case " ":
                    // Hard drop
                    let y = 0;
                    while (
                        isValidMove(
                            { ...currentPiece, y: currentPiece.y + y + 1 },
                            board
                        )
                    ) {
                        y++;
                    }
                    if (y > 0) {
                        movePiece(0, y);
                    }
                    break;
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [gameStarted, gameOver, currentPiece, board, isValidMove, movePiece]);

    // Game loop
    useEffect(() => {
        if (!gameStarted || gameOver) return;

        const gameLoop = setInterval(() => {
            dropPiece();
        }, 800);

        return () => {
            clearInterval(gameLoop);
        };
    }, [gameStarted, gameOver, dropPiece]);

    // Timer countdown
    useEffect(() => {
        // CRITICAL FIX: Wait for first render to complete before starting timer
        const timerStart = requestAnimationFrame(() => {
            const timer = setInterval(() => {
                setTimeRemaining((prev) => {
                    if (prev <= 1) {
                        clearInterval(timer);
                        if (onGameComplete && !completionCalled) {
                            setCompletionCalled(true);

                            // Use requestAnimationFrame again for the callback
                            requestAnimationFrame(() => {
                                onGameComplete();
                            });
                        }
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);

            return () => clearInterval(timer);
        });

        return () => cancelAnimationFrame(timerStart);
    }, [onGameComplete, completionCalled]);

    // Handle game completion
    useEffect(() => {
        // Avoid calling onGameComplete multiple times
        if (completionCalled) return;

        const shouldComplete =
            score >= SCORE_THRESHOLD || gameOver || timeRemaining <= 0;

        if (shouldComplete && onGameComplete && !completionCalled) {
            setCompletionCalled(true);

            // CRITICAL FIX: Use requestAnimationFrame to defer the callback until after render
            requestAnimationFrame(() => {
                onGameComplete();
            });
        }
    }, [score, gameOver, timeRemaining, onGameComplete, completionCalled]);

    // Start new game
    const startGame = () => {
        setBoard(createEmptyBoard());
        setCurrentPiece(getRandomPiece());
        setScore(0);
        setGameOver(false);
        setGameStarted(true);
        setCompletionCalled(false);
    };

    // Render the combined board with the current piece
    const renderBoard = () => {
        const displayBoard = board.map((row) => [...row]);

        if (gameStarted && !gameOver) {
            currentPiece.shape.forEach((row, dy) => {
                row.forEach((value, dx) => {
                    if (value !== 0) {
                        const y = currentPiece.y + dy;
                        const x = currentPiece.x + dx;
                        if (y >= 0 && y < BOARD_HEIGHT) {
                            displayBoard[y][x] = currentPiece.color + 1;
                        }
                    }
                });
            });
        }

        return displayBoard;
    };

    // Format time as MM:SS
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
    };

    // Skip button for those who don't want to play
    const handleSkip = () => {
        if (onGameComplete && !completionCalled) {
            console.log("User skipped tetris game");
            setCompletionCalled(true);
            setTimeout(() => {
                onGameComplete();
            }, 100);
        }
    };

    return (
        <div className="flex flex-col items-center">
            <div className="mb-4 text-white flex justify-between w-full px-4">
                <div className="text-xl">Score: {score}</div>
                <div className="text-xl">Time: {formatTime(timeRemaining)}</div>
            </div>

            <div
                className="border border-gray-700 bg-black bg-opacity-70"
                style={{ width: BOARD_WIDTH * 25 + "px" }}
            >
                {renderBoard().map((row, y) => (
                    <div key={y} className="flex">
                        {row.map((cell, x) => (
                            <div
                                key={`${y}-${x}`}
                                className="border border-gray-900"
                                style={{
                                    width: "25px",
                                    height: "25px",
                                    backgroundColor: cell
                                        ? COLORS[cell - 1]
                                        : "transparent",
                                }}
                            />
                        ))}
                    </div>
                ))}
            </div>

            {!gameStarted && (
                <div className="mt-4 flex flex-col items-center">
                    <button
                        className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                        onClick={startGame}
                    >
                        Start Game
                    </button>
                </div>
            )}

            {gameOver && (
                <div className="mt-4 text-center">
                    <div className="text-white text-xl mb-2">
                        {score >= SCORE_THRESHOLD ? "Well done!" : "Game Over!"}
                    </div>
                    <div className="flex space-x-4">
                        <button
                            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                            onClick={startGame}
                        >
                            Play Again
                        </button>

                        <button
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                            onClick={handleSkip}
                        >
                            Continue
                        </button>
                    </div>
                </div>
            )}

            {gameStarted && !gameOver && (
                <div className="mt-4 text-gray-300 text-sm">
                    <p>Controls:</p>
                    <p>← → : Move left/right</p>
                    <p>↓ : Move down</p>
                    <p>↑ : Rotate</p>
                    <p>Space : Hard drop</p>
                </div>
            )}
        </div>
    );
}
