import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import { createContext, useContext } from 'react';
import icon from '../../assets/icon.svg';
import './App.css';

declare global {
  interface Window {
    electron: {
      store: {
        get: (key: string) => any;
        set: (key: string, val: any) => void;
        // any other methods you've defined...
      };
    };
  }
}

const AccountsContext = createContext({});

const Hello = () => {
  if (!window.electron.store.get('testValue')) {
    window.electron.store.set('testValue', {
      k: 'default val',
    });
  }
  return (
    <div>
      <input
        type="text"
        onChange={(e) =>
          window.electron.store.set('testValue', {
            k: e.target.value,
          })
        }
        value={window.electron.store.get('testValue')?.k}
      />
    </div>
  );
};

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Hello />} />
      </Routes>
    </Router>
  );
}
