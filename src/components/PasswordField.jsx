import { useState } from 'react';
import { Eye, EyeOff, Wand2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { generatePassword, passwordStrength } from '../services/userService';
import { Input } from './ui';

const BAR = ['bg-down', 'bg-down', 'bg-amber-500', 'bg-up', 'bg-up'];

/** Password input with show/hide, optional generator and a strength meter. */
export function PasswordField({ value, onChange, generate, meter = true, autoComplete = 'new-password', placeholder, ...rest }) {
  const [show, setShow] = useState(false);
  const s = passwordStrength(value || '');
  return (
    <div>
      <div className="relative">
        <Input
          type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete}
          placeholder={placeholder} className={cn('font-mono', generate ? 'pr-[104px]' : 'pr-10')} {...rest}
        />
        <div className="absolute inset-y-0 right-1.5 flex items-center gap-0.5">
          {generate && (
            <button type="button" title="Generate a strong password" onClick={() => { onChange(generatePassword()); setShow(true); }}
              className="flex h-7 items-center gap-1 rounded px-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900">
              <Wand2 className="h-3.5 w-3.5" />Generate
            </button>
          )}
          <button type="button" title={show ? 'Hide' : 'Show'} onClick={() => setShow((v) => !v)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {meter && value && (
        <div className="mt-2 flex items-center gap-2">
          <div className="grid flex-1 grid-cols-4 gap-1">
            {[1, 2, 3, 4].map((i) => <span key={i} className={cn('h-1 rounded-full transition-colors', i <= s.score ? BAR[s.score] : 'bg-slate-200')} />)}
          </div>
          <span className="w-16 text-right text-[11px] text-slate-500">{s.label}</span>
        </div>
      )}
    </div>
  );
}
