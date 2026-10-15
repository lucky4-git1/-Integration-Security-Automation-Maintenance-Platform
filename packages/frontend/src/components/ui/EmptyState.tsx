interface Props {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon = 'bi-inbox', title, description, action }: Props) {
  return (
    <div className="text-center py-5 px-3">
      <i className={`bi ${icon} display-4 text-muted`}></i>
      <h6 className="mt-3 mb-1">{title}</h6>
      {description && <p className="text-muted small mb-3">{description}</p>}
      {action}
    </div>
  );
}
