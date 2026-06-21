import { RotateCcw } from 'lucide-react'

export default function Slider({
  id,
  label,
  hint,
  min,
  max,
  step,
  value,
  defaultValue,
  unit = '',
  onChange,
}) {
  const atDefault = Math.abs(value - defaultValue) < 1e-9

  return (
    <div className="slider">
      <div className="slider-top">
        <label htmlFor={id}>
          {label}
          {hint && <span className="muted"> - {hint}</span>}
        </label>
        <div className="slider-value">
          <span>
            {value.toFixed(step < 1 ? 2 : 0)}
            {unit}
          </span>
          {!atDefault && (
            <button
              type="button"
              className="icon-reset"
              title="Reset to default"
              aria-label={`Reset ${label.toLowerCase()}`}
              onClick={() => onChange(defaultValue)}
            >
              <RotateCcw size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(parseFloat(event.target.value))}
      />
    </div>
  )
}
