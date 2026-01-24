import { useState, useEffect } from 'react';
import type { ScheduleType } from '../../shared/types';

interface ScheduleEditorProps {
  scheduleType: ScheduleType;
  scheduleValue: string;
  suggestedSchedule?: string | null;
  onTypeChange: (type: ScheduleType) => void;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

export function ScheduleEditor({
  scheduleType,
  scheduleValue,
  suggestedSchedule,
  onTypeChange,
  onValueChange,
  disabled,
}: ScheduleEditorProps) {
  return (
    <div className="schedule-editor">
      <label className="schedule-editor__section-label">Schedule *</label>

      <div className="schedule-editor__type-selector">
        <button
          type="button"
          className={`schedule-editor__type-btn ${scheduleType === 'cron' ? 'schedule-editor__type-btn--active' : ''}`}
          onClick={() => onTypeChange('cron')}
          disabled={disabled}
        >
          Cron
        </button>
        <button
          type="button"
          className={`schedule-editor__type-btn ${scheduleType === 'interval' ? 'schedule-editor__type-btn--active' : ''}`}
          onClick={() => onTypeChange('interval')}
          disabled={disabled}
        >
          Interval
        </button>
        <button
          type="button"
          className={`schedule-editor__type-btn ${scheduleType === 'once' ? 'schedule-editor__type-btn--active' : ''}`}
          onClick={() => onTypeChange('once')}
          disabled={disabled}
        >
          One-time
        </button>
      </div>

      {suggestedSchedule && scheduleType === 'cron' && (
        <div className="schedule-editor__suggestion">
          <span>Suggested:</span>
          <button
            type="button"
            className="schedule-editor__suggestion-btn"
            onClick={() => onValueChange(suggestedSchedule)}
            disabled={disabled}
          >
            {suggestedSchedule}
          </button>
        </div>
      )}

      {scheduleType === 'cron' && (
        <CronBuilder value={scheduleValue} onChange={onValueChange} disabled={disabled ?? false} />
      )}

      {scheduleType === 'interval' && (
        <IntervalSelector
          value={scheduleValue}
          onChange={onValueChange}
          disabled={disabled ?? false}
        />
      )}

      {scheduleType === 'once' && (
        <DatetimePicker
          value={scheduleValue}
          onChange={onValueChange}
          disabled={disabled ?? false}
        />
      )}
    </div>
  );
}

// Cron Builder Component
interface CronBuilderProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

interface CronParts {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
}

const CRON_PRESETS = [
  { label: 'Every minute', value: '* * * * *' },
  { label: 'Every 5 minutes', value: '*/5 * * * *' },
  { label: 'Every 15 minutes', value: '*/15 * * * *' },
  { label: 'Every 30 minutes', value: '*/30 * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Every 12 hours', value: '0 */12 * * *' },
  { label: 'Daily at midnight', value: '0 0 * * *' },
  { label: 'Daily at 9 AM', value: '0 9 * * *' },
  { label: 'Weekly (Sunday)', value: '0 0 * * 0' },
  { label: 'Weekly (Monday)', value: '0 0 * * 1' },
  { label: 'Monthly', value: '0 0 1 * *' },
];

function CronBuilder({ value, onChange, disabled }: CronBuilderProps) {
  const [mode, setMode] = useState<'preset' | 'custom'>('preset');

  const parseCronParts = (cronStr: string): CronParts => {
    const parts = cronStr.split(' ');
    return {
      minute: parts[0] || '*',
      hour: parts[1] || '*',
      dayOfMonth: parts[2] || '*',
      month: parts[3] || '*',
      dayOfWeek: parts[4] || '*',
    };
  };

  const [cronParts, setCronParts] = useState<CronParts>(() => parseCronParts(value));

  useEffect(() => {
    setCronParts(parseCronParts(value));
  }, [value]);

  const handlePartChange = (part: keyof CronParts, newValue: string) => {
    const newParts = { ...cronParts, [part]: newValue };
    setCronParts(newParts);
    onChange(
      `${newParts.minute} ${newParts.hour} ${newParts.dayOfMonth} ${newParts.month} ${newParts.dayOfWeek}`
    );
  };

  const handlePresetChange = (presetValue: string) => {
    onChange(presetValue);
  };

  const description = describeCron(value);

  return (
    <div className="cron-builder">
      <div className="cron-builder__mode-toggle">
        <button
          type="button"
          className={`cron-builder__mode-btn ${mode === 'preset' ? 'cron-builder__mode-btn--active' : ''}`}
          onClick={() => setMode('preset')}
          disabled={disabled}
        >
          Presets
        </button>
        <button
          type="button"
          className={`cron-builder__mode-btn ${mode === 'custom' ? 'cron-builder__mode-btn--active' : ''}`}
          onClick={() => setMode('custom')}
          disabled={disabled}
        >
          Custom
        </button>
      </div>

      {mode === 'preset' ? (
        <div className="cron-builder__presets">
          <select
            className="cron-builder__preset-select"
            value={value}
            onChange={(e) => handlePresetChange(e.target.value)}
            disabled={disabled}
          >
            <option value="">Select a preset...</option>
            {CRON_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="cron-builder__custom">
          <div className="cron-builder__fields">
            <div className="cron-builder__field">
              <label className="cron-builder__field-label">Minute</label>
              <input
                type="text"
                className="cron-builder__field-input"
                value={cronParts.minute}
                onChange={(e) => handlePartChange('minute', e.target.value)}
                placeholder="*"
                disabled={disabled}
              />
            </div>
            <div className="cron-builder__field">
              <label className="cron-builder__field-label">Hour</label>
              <input
                type="text"
                className="cron-builder__field-input"
                value={cronParts.hour}
                onChange={(e) => handlePartChange('hour', e.target.value)}
                placeholder="*"
                disabled={disabled}
              />
            </div>
            <div className="cron-builder__field">
              <label className="cron-builder__field-label">Day of Month</label>
              <input
                type="text"
                className="cron-builder__field-input"
                value={cronParts.dayOfMonth}
                onChange={(e) => handlePartChange('dayOfMonth', e.target.value)}
                placeholder="*"
                disabled={disabled}
              />
            </div>
            <div className="cron-builder__field">
              <label className="cron-builder__field-label">Month</label>
              <input
                type="text"
                className="cron-builder__field-input"
                value={cronParts.month}
                onChange={(e) => handlePartChange('month', e.target.value)}
                placeholder="*"
                disabled={disabled}
              />
            </div>
            <div className="cron-builder__field">
              <label className="cron-builder__field-label">Day of Week</label>
              <input
                type="text"
                className="cron-builder__field-input"
                value={cronParts.dayOfWeek}
                onChange={(e) => handlePartChange('dayOfWeek', e.target.value)}
                placeholder="*"
                disabled={disabled}
              />
            </div>
          </div>
          <div className="cron-builder__raw">
            <label className="cron-builder__field-label">Raw Expression</label>
            <input
              type="text"
              className="cron-builder__raw-input"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="* * * * *"
              disabled={disabled}
            />
          </div>
        </div>
      )}

      {value && (
        <div className="cron-builder__description">
          <span className="cron-builder__description-label">Runs:</span>
          <span className="cron-builder__description-text">{description}</span>
        </div>
      )}
    </div>
  );
}

// Helper to describe cron expressions
function describeCron(cron: string): string {
  if (!cron || cron.trim() === '') return 'Not set';

  const parts = cron.split(' ');
  if (parts.length !== 5) return 'Invalid expression';

  const minute = parts[0] ?? '';
  const hour = parts[1] ?? '';
  const dayOfMonth = parts[2] ?? '';
  const month = parts[3] ?? '';
  const dayOfWeek = parts[4] ?? '';

  // Common patterns
  if (cron === '* * * * *') return 'Every minute';
  if (cron === '0 * * * *') return 'Every hour';
  if (cron === '0 0 * * *') return 'Every day at midnight';
  if (cron === '0 0 * * 0') return 'Every Sunday at midnight';
  if (cron === '0 0 * * 1') return 'Every Monday at midnight';
  if (cron === '0 0 1 * *') return 'First day of every month at midnight';

  // Parse step patterns
  if (minute.startsWith('*/')) {
    const step = minute.slice(2);
    if (hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return `Every ${step} minutes`;
    }
  }

  if (hour.startsWith('*/') && minute === '0') {
    const step = hour.slice(2);
    if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return `Every ${step} hours`;
    }
  }

  // Specific times
  if (
    !minute.includes('*') &&
    !minute.includes('/') &&
    !hour.includes('*') &&
    !hour.includes('/')
  ) {
    const timeStr = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;

    if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return `Every day at ${timeStr}`;
    }
    if (dayOfMonth === '*' && month === '*' && dayOfWeek !== '*') {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayNum = parseInt(dayOfWeek, 10);
      if (!isNaN(dayNum) && dayNum >= 0 && dayNum <= 6) {
        return `Every ${days[dayNum]} at ${timeStr}`;
      }
    }
    if (dayOfMonth !== '*' && month === '*' && dayOfWeek === '*') {
      return `Day ${dayOfMonth} of every month at ${timeStr}`;
    }
  }

  return `Custom: ${cron}`;
}

// Interval Selector Component
interface IntervalSelectorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const INTERVAL_PRESETS = [
  { label: '1 minute', minutes: 1 },
  { label: '5 minutes', minutes: 5 },
  { label: '10 minutes', minutes: 10 },
  { label: '15 minutes', minutes: 15 },
  { label: '30 minutes', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '2 hours', minutes: 120 },
  { label: '4 hours', minutes: 240 },
  { label: '6 hours', minutes: 360 },
  { label: '12 hours', minutes: 720 },
  { label: '24 hours', minutes: 1440 },
];

function IntervalSelector({ value, onChange, disabled }: IntervalSelectorProps) {
  const [mode, setMode] = useState<'preset' | 'custom'>('preset');
  const [customValue, setCustomValue] = useState(value || '');
  const [customUnit, setCustomUnit] = useState<'minutes' | 'hours' | 'days'>('minutes');

  useEffect(() => {
    setCustomValue(value || '');
  }, [value]);

  const handlePresetChange = (minutes: number) => {
    onChange(String(minutes));
  };

  const handleCustomChange = (val: string, unit: 'minutes' | 'hours' | 'days') => {
    setCustomValue(val);
    setCustomUnit(unit);
    const numVal = parseInt(val, 10);
    if (!isNaN(numVal) && numVal > 0) {
      let minutes = numVal;
      if (unit === 'hours') minutes = numVal * 60;
      if (unit === 'days') minutes = numVal * 1440;
      onChange(String(minutes));
    }
  };

  const describeInterval = (minutes: string): string => {
    const num = parseInt(minutes, 10);
    if (isNaN(num) || num <= 0) return 'Invalid interval';

    if (num < 60) return `Every ${num} minute${num !== 1 ? 's' : ''}`;
    if (num < 1440) {
      const hours = num / 60;
      if (Number.isInteger(hours)) {
        return `Every ${hours} hour${hours !== 1 ? 's' : ''}`;
      }
      return `Every ${num} minutes`;
    }
    const days = num / 1440;
    if (Number.isInteger(days)) {
      return `Every ${days} day${days !== 1 ? 's' : ''}`;
    }
    return `Every ${num} minutes`;
  };

  return (
    <div className="interval-selector">
      <div className="interval-selector__mode-toggle">
        <button
          type="button"
          className={`interval-selector__mode-btn ${mode === 'preset' ? 'interval-selector__mode-btn--active' : ''}`}
          onClick={() => setMode('preset')}
          disabled={disabled}
        >
          Presets
        </button>
        <button
          type="button"
          className={`interval-selector__mode-btn ${mode === 'custom' ? 'interval-selector__mode-btn--active' : ''}`}
          onClick={() => setMode('custom')}
          disabled={disabled}
        >
          Custom
        </button>
      </div>

      {mode === 'preset' ? (
        <div className="interval-selector__presets">
          <select
            className="interval-selector__preset-select"
            value={value}
            onChange={(e) => handlePresetChange(parseInt(e.target.value, 10))}
            disabled={disabled}
          >
            <option value="">Select an interval...</option>
            {INTERVAL_PRESETS.map((preset) => (
              <option key={preset.minutes} value={preset.minutes}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="interval-selector__custom">
          <input
            type="number"
            className="interval-selector__custom-input"
            value={customValue}
            onChange={(e) => handleCustomChange(e.target.value, customUnit)}
            min={1}
            placeholder="Enter value"
            disabled={disabled}
          />
          <select
            className="interval-selector__custom-unit"
            value={customUnit}
            onChange={(e) =>
              handleCustomChange(customValue, e.target.value as 'minutes' | 'hours' | 'days')
            }
            disabled={disabled}
          >
            <option value="minutes">Minutes</option>
            <option value="hours">Hours</option>
            <option value="days">Days</option>
          </select>
        </div>
      )}

      {value && (
        <div className="interval-selector__description">
          <span className="interval-selector__description-label">Runs:</span>
          <span className="interval-selector__description-text">{describeInterval(value)}</span>
        </div>
      )}
    </div>
  );
}

// Datetime Picker Component
interface DatetimePickerProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

function DatetimePicker({ value, onChange, disabled }: DatetimePickerProps) {
  const [dateValue, setDateValue] = useState('');
  const [timeValue, setTimeValue] = useState('');

  // Parse ISO string to date/time parts
  useEffect(() => {
    if (value) {
      try {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          // Format for local datetime-local input
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
          setDateValue(`${year}-${month}-${day}`);
          setTimeValue(`${hours}:${minutes}`);
        }
      } catch {
        // Invalid date, ignore
      }
    }
  }, [value]);

  const handleDateChange = (newDate: string) => {
    setDateValue(newDate);
    updateValue(newDate, timeValue);
  };

  const handleTimeChange = (newTime: string) => {
    setTimeValue(newTime);
    updateValue(dateValue, newTime);
  };

  const updateValue = (date: string, time: string) => {
    if (date && time) {
      const datetime = new Date(`${date}T${time}`);
      if (!isNaN(datetime.getTime())) {
        onChange(datetime.toISOString());
      }
    }
  };

  // Get minimum date (now)
  const getMinDate = (): string => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatDatetime = (): string => {
    if (!value) return 'Not set';
    try {
      const date = new Date(value);
      if (isNaN(date.getTime())) return 'Invalid date';
      return date.toLocaleString();
    } catch {
      return 'Invalid date';
    }
  };

  return (
    <div className="datetime-picker">
      <div className="datetime-picker__fields">
        <div className="datetime-picker__field">
          <label className="datetime-picker__label">Date</label>
          <input
            type="date"
            className="datetime-picker__input"
            value={dateValue}
            min={getMinDate()}
            onChange={(e) => handleDateChange(e.target.value)}
            disabled={disabled}
          />
        </div>
        <div className="datetime-picker__field">
          <label className="datetime-picker__label">Time</label>
          <input
            type="time"
            className="datetime-picker__input"
            value={timeValue}
            onChange={(e) => handleTimeChange(e.target.value)}
            disabled={disabled}
          />
        </div>
      </div>

      {value && (
        <div className="datetime-picker__preview">
          <span className="datetime-picker__preview-label">Scheduled for:</span>
          <span className="datetime-picker__preview-text">{formatDatetime()}</span>
        </div>
      )}

      <p className="datetime-picker__note">
        Task will run once at the specified time and then be automatically disabled.
      </p>
    </div>
  );
}

// Schedule validation helper
export function validateSchedule(
  scheduleType: ScheduleType,
  scheduleValue: string
): { valid: boolean; error: string | null } {
  if (!scheduleValue || scheduleValue.trim() === '') {
    return { valid: false, error: 'Schedule is required' };
  }

  switch (scheduleType) {
    case 'cron': {
      const parts = scheduleValue.trim().split(/\s+/);
      if (parts.length !== 5) {
        return { valid: false, error: 'Cron expression must have 5 fields' };
      }
      // Basic validation - just check it has 5 parts
      // Server will do full validation
      return { valid: true, error: null };
    }

    case 'interval': {
      const minutes = parseInt(scheduleValue, 10);
      if (isNaN(minutes) || minutes < 1) {
        return { valid: false, error: 'Interval must be a positive number of minutes' };
      }
      return { valid: true, error: null };
    }

    case 'once': {
      try {
        const date = new Date(scheduleValue);
        if (isNaN(date.getTime())) {
          return { valid: false, error: 'Invalid date/time' };
        }
        if (date.getTime() < Date.now()) {
          return { valid: false, error: 'Date must be in the future' };
        }
        return { valid: true, error: null };
      } catch {
        return { valid: false, error: 'Invalid date format' };
      }
    }

    default:
      return { valid: false, error: 'Unknown schedule type' };
  }
}
