'use client';

interface FilterSelectProps {
  name: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
  placeholder: string;
}

export function FilterSelect({ name, defaultValue, options, placeholder }: FilterSelectProps) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const url = new URL(window.location.href);
    if (e.target.value) {
      url.searchParams.set(name, e.target.value);
    } else {
      url.searchParams.delete(name);
    }
    url.searchParams.delete('page'); // Reset to page 1
    window.location.href = url.toString();
  };

  return (
    <select
      defaultValue={defaultValue || ''}
      onChange={handleChange}
      className="px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
