import { useEffect, useRef, useState } from 'react';
import GameEngine from './game/GameEngine';

function App() {
  const canvasRef = useRef(null);
  const [gameState, setGameState] = useState('start'); // start, playing, gameover
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(32); // Hardcoded best score for now to match screenshot

  useEffect(() => {
    if (!canvasRef.current) return;
    
    const engine = new GameEngine(canvasRef.current, {
      onScoreChange: (newScore) => setScore(newScore),
      onGameOver: () => {
        setGameState('gameover');
        setBestScore(prev => Math.max(prev, score));
      }
    });

    if (gameState === 'playing') {
      engine.start();
    } else if (gameState === 'start') {
      engine.drawStartScreen();
    }

    return () => {
      engine.cleanup();
    };
  }, [gameState]);

  const startGame = () => {
    setScore(0);
    setGameState('playing');
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        if (gameState === 'start' || gameState === 'gameover') {
          startGame();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState]);

  return (
    <div className="app-container">
      <div className="game-wrapper">
        <canvas ref={canvasRef} width={800} height={600} />

        {/* UI Layer for HUD when playing or starting */}
        {(gameState === 'playing' || gameState === 'start') && (
          <div className="ui-layer">
            <div className="pixel-text score-display">
              {gameState === 'playing' ? score : `SCORE: ${score}`}
            </div>
            {gameState === 'start' && (
              <>
                <div className="pixel-text best-display">BEST: {bestScore}</div>
                <div className="pixel-text instruction-text">PRESS SPACE OR CLICK TO FLAP</div>
              </>
            )}
          </div>
        )}

        {/* Game Over Overlay */}
        {gameState === 'gameover' && (
          <div className="overlay">
            <div className="game-over-board">
              <h2 className="game-over-title">GAME OVER</h2>
              
              <div className="score-container">
                <div className="score-box">
                  <span className="score-label">CURRENT SCORE</span>
                  <div className="score-value">
                    <div className="medal"></div>
                    {score}
                  </div>
                </div>
                
                <div className="score-box">
                  <span className="score-label">BEST SCORE</span>
                  <div className="score-value">
                    <div className="medal"></div>
                    {Math.max(score, bestScore)}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="button-container">
              <button className="retro-btn btn-green" onClick={startGame}>
                <span className="btn-icon">▶</span> PLAY AGAIN
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
