export function getPagination(query = {}, options = {}) {
  const defaultPageSize = options.defaultPageSize || 20;
  const maxPageSize = options.maxPageSize || 200;
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = Math.min(maxPageSize, Math.max(1, Number.parseInt(query.pageSize, 10) || defaultPageSize));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function paginationMeta(total, page, pageSize) {
  const totalItems = Math.max(0, Number(total) || 0);
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  return { page, pageSize, totalItems, totalPages, hasPrevious: page > 1, hasNext: page < totalPages };
}
