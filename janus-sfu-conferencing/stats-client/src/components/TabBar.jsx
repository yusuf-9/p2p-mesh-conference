const TABS = [
  { id: 'summary', label: 'Summary' },
  { id: 'connections', label: 'Connections', countKey: 'connections' },
  { id: 'streams', label: 'Streams', countKey: 'streams' },
];

export default function TabBar({ activeTab, onChange, counts = {} }) {
  return (
    <div className="tab-bar" role="tablist">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          className={`tab-bar-item${activeTab === tab.id ? ' tab-bar-item-active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.countKey && counts[tab.countKey] != null && (
            <span className="tab-bar-badge">x{counts[tab.countKey]}</span>
          )}
        </button>
      ))}
    </div>
  );
}
