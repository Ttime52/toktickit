import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";

import {
  ApiRequestError,
  fetchCategories,
  fetchRelatedSystems,
  fetchTickets,
  type Category,
  type RelatedSystem,
  type RequestedPriority,
  type TicketListItem,
  type TicketListMeta,
  type TicketListQuery,
  type TicketPageSize,
  type TicketSortField,
  type TicketSortOrder,
} from "./api.js";

type AppPage = "my-tickets" | "create-ticket";

interface MyTicketsProps {
  requesterId: number;
  requesterName: string;
  onNavigate?: (page: AppPage) => void;
  onOpenTicket?: (ticketId: number) => void;
}

type ListState = "loading" | "success" | "error";
type ReferenceState = "loading" | "success" | "error";

interface TicketFilters {
  search: string;
  categoryId: string;
  relatedSystemId: string;
  requestedPriority: "" | RequestedPriority;
  currentStatus: "" | "NEW";
  sortBy: TicketSortField;
  sortOrder: TicketSortOrder;
}

const INITIAL_FILTERS: TicketFilters = {
  search: "",
  categoryId: "",
  relatedSystemId: "",
  requestedPriority: "",
  currentStatus: "",
  sortBy: "updatedAt",
  sortOrder: "desc",
};

const PAGE_SIZES: TicketPageSize[] = [10, 20, 50];

const SORT_OPTIONS: Array<{ value: TicketSortField; label: string }> = [
  { value: "updatedAt", label: "Last Updated" },
  { value: "ticketNumber", label: "Ticket Number" },
  { value: "ticketDate", label: "Ticket Date" },
  { value: "category", label: "Category" },
  { value: "requestedPriority", label: "Requested Priority" },
  { value: "currentStatus", label: "Current Status" },
];

function safeErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiRequestError) || error.message.length === 0) {
    return fallback;
  }

  // Keep the list screen safe even if a misconfigured proxy/database returns
  // internal-looking text instead of the documented safe API message.
  return /\b(sql|select|insert|update|delete|password|secret|stack|trace|prisma|node_modules)\b/iu.test(
    error.message,
  )
    ? fallback
    : error.message;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function isFiltered(filters: TicketFilters): boolean {
  return (
    filters.search.trim().length > 0 ||
    filters.categoryId !== "" ||
    filters.relatedSystemId !== "" ||
    filters.requestedPriority !== "" ||
    filters.currentStatus !== ""
  );
}

function priorityLabel(priority: RequestedPriority): string {
  return priority[0] + priority.slice(1).toLowerCase();
}

function statusLabel(status: "NEW"): string {
  return status === "NEW" ? "New" : status;
}

function sortDirectionLabel(order: TicketSortOrder): string {
  return order === "asc" ? "Ascending" : "Descending";
}

function getPageSummary(meta: TicketListMeta): string {
  if (meta.totalItems === 0) return "0 Tickets";
  const first = (meta.page - 1) * meta.pageSize + 1;
  const last = Math.min(meta.page * meta.pageSize, meta.totalItems);
  return `Showing ${first}–${last} of ${meta.totalItems} Tickets`;
}

export default function MyTickets({
  requesterId,
  requesterName,
  onNavigate,
  onOpenTicket,
}: MyTicketsProps) {
  const [filters, setFilters] = useState<TicketFilters>(INITIAL_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<TicketPageSize>(10);
  const [listState, setListState] = useState<ListState>("loading");
  const [listError, setListError] = useState<string | null>(null);
  const [listResult, setListResult] = useState<{
    data: TicketListItem[];
    meta: TicketListMeta;
  } | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [relatedSystems, setRelatedSystems] = useState<RelatedSystem[]>([]);
  const [referenceState, setReferenceState] = useState<ReferenceState>("loading");
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [listRetry, setListRetry] = useState(0);
  const [referenceRetry, setReferenceRetry] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const query = useMemo<TicketListQuery>(
    () => ({
      requesterId,
      search: filters.search,
      categoryId: filters.categoryId === "" ? null : Number(filters.categoryId),
      relatedSystemId:
        filters.relatedSystemId === "" ? null : Number(filters.relatedSystemId),
      requestedPriority:
        filters.requestedPriority === "" ? null : filters.requestedPriority,
      currentStatus: filters.currentStatus === "" ? null : filters.currentStatus,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
      page,
      pageSize,
    }),
    [filters, page, pageSize, requesterId],
  );
  const queryKey = JSON.stringify(query);

  useEffect(() => {
    const controller = new AbortController();
    setReferenceState("loading");
    setReferenceError(null);

    Promise.all([fetchCategories(controller.signal), fetchRelatedSystems(controller.signal)])
      .then(([loadedCategories, loadedRelatedSystems]) => {
        setCategories(loadedCategories);
        setRelatedSystems(loadedRelatedSystems);
        setReferenceState("success");
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setReferenceState("error");
        setReferenceError(
          "Unable to load Ticket filter references. Please try again.",
        );
      });

    return () => controller.abort();
  }, [referenceRetry]);

  useEffect(() => {
    const controller = new AbortController();
    setListState("loading");
    setListError(null);

    fetchTickets(query, controller.signal)
      .then((result) => {
        setListResult(result);
        setListState("success");
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setListState("error");
        setListError(safeErrorMessage(error, "Unable to load My Tickets. Please try again."));
      });

    return () => controller.abort();
  }, [queryKey, listRetry]);

  function updateFilter<K extends keyof TicketFilters>(
    field: K,
    value: TicketFilters[K],
  ) {
    setFilters((current) => ({ ...current, [field]: value }));
    setPage(1);
  }

  function handleSelectChange(
    field: "categoryId" | "relatedSystemId" | "requestedPriority" | "currentStatus" | "sortBy" | "sortOrder",
    event: ChangeEvent<HTMLSelectElement>,
  ) {
    updateFilter(field, event.target.value as TicketFilters[typeof field]);
  }

  function handleSortHeader(field: TicketSortField) {
    if (filters.sortBy === field) {
      updateFilter("sortOrder", filters.sortOrder === "asc" ? "desc" : "asc");
      return;
    }

    updateFilter("sortBy", field);
    updateFilter("sortOrder", field === "updatedAt" ? "desc" : "asc");
  }

  function clearFilters() {
    setFilters(INITIAL_FILTERS);
    setPage(1);
  }

  function handlePageSizeChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextPageSize = Number(event.target.value);
    if (PAGE_SIZES.includes(nextPageSize as TicketPageSize)) {
      setPageSize(nextPageSize as TicketPageSize);
      setPage(1);
    }
  }

  function openTicket(ticketId: number) {
    if (onOpenTicket !== undefined) {
      onOpenTicket(ticketId);
      return;
    }
    setNotice("Ticket Detail is not part of Issue 5 yet.");
  }

  const hasFilters = isFiltered(filters);
  const tickets = listResult?.data ?? [];
  const meta = listResult?.meta ?? null;
  const referencesLoading = referenceState === "loading";
  const referencesUnavailable = referenceState === "error";

  function sortHeader(field: TicketSortField, label: string) {
    const active = filters.sortBy === field;
    return (
      <button
        type="button"
        className="zen-table-sort-button"
        aria-label={`Sort by ${label}`}
        onClick={() => handleSortHeader(field)}
      >
        {label}
        <span aria-hidden="true">{active ? (filters.sortOrder === "asc" ? " ↑" : " ↓") : " ↕"}</span>
      </button>
    );
  }

  function renderTicketCard(ticket: TicketListItem) {
    return (
      <article className="zen-ticket-card" key={ticket.id}>
        <div className="zen-ticket-card-heading">
          <span className="zen-ticket-number">{ticket.ticketNumber}</span>
          <span className="zen-badge zen-badge-status">{statusLabel(ticket.currentStatus)}</span>
        </div>
        <h2>{ticket.summary}</h2>
        <dl className="zen-ticket-card-details">
          <div>
            <dt>Category</dt>
            <dd>{ticket.category.name}</dd>
          </div>
          <div>
            <dt>Related System</dt>
            <dd>{ticket.relatedSystem.name}</dd>
          </div>
          <div>
            <dt>Requested Priority</dt>
            <dd><span className="zen-badge zen-badge-priority">{priorityLabel(ticket.requestedPriority)}</span></dd>
          </div>
          <div>
            <dt>Last Updated</dt>
            <dd>{formatDate(ticket.updatedAt)}</dd>
          </div>
        </dl>
        <button
          type="button"
          className="zen-button zen-button-secondary zen-ticket-open-button"
          onClick={() => openTicket(ticket.id)}
          aria-label={`Open ${ticket.ticketNumber}`}
        >
          Open
        </button>
      </article>
    );
  }

  return (
    <div className="zen-my-tickets-page">
      <header className="zen-list-heading">
        <div>
          <p className="zen-eyebrow">Requester workspace</p>
          <h1>My Tickets</h1>
          <p className="zen-lead">
            Review and manage Tickets for the selected Development Requester.
          </p>
        </div>
        <button
          type="button"
          className="zen-button zen-button-primary"
          onClick={() => onNavigate?.("create-ticket")}
        >
          Create Ticket
        </button>
      </header>

      <section className="zen-ticket-toolbar" aria-label="Ticket filters and sorting">
        <div className="zen-list-field zen-list-search">
          <label htmlFor="ticket-search">Search Tickets</label>
          <input
            id="ticket-search"
            type="search"
            value={filters.search}
            maxLength={100}
            placeholder="Search number, summary, or description"
            onChange={(event) => updateFilter("search", event.target.value)}
          />
        </div>

        <div className="zen-list-field">
          <label htmlFor="ticket-category-filter">Category</label>
          <select
            id="ticket-category-filter"
            value={filters.categoryId}
            disabled={referencesLoading || referencesUnavailable}
            onChange={(event) => handleSelectChange("categoryId", event)}
          >
            <option value="">All Categories</option>
            {categories.map((category) => (
              <option value={category.id} key={category.id}>{category.name}</option>
            ))}
          </select>
        </div>

        <div className="zen-list-field">
          <label htmlFor="ticket-related-system-filter">Related System</label>
          <select
            id="ticket-related-system-filter"
            value={filters.relatedSystemId}
            disabled={referencesLoading || referencesUnavailable}
            onChange={(event) => handleSelectChange("relatedSystemId", event)}
          >
            <option value="">All Related Systems</option>
            {relatedSystems.map((relatedSystem) => (
              <option value={relatedSystem.id} key={relatedSystem.id}>{relatedSystem.name}</option>
            ))}
          </select>
        </div>

        <div className="zen-list-field">
          <label htmlFor="ticket-priority-filter">Requested Priority</label>
          <select
            id="ticket-priority-filter"
            value={filters.requestedPriority}
            onChange={(event) => handleSelectChange("requestedPriority", event)}
          >
            <option value="">All Requested Priorities</option>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>
        </div>

        <div className="zen-list-field">
          <label htmlFor="ticket-status-filter">Current Status</label>
          <select
            id="ticket-status-filter"
            value={filters.currentStatus}
            onChange={(event) => handleSelectChange("currentStatus", event)}
          >
            <option value="">All Current Statuses</option>
            <option value="NEW">New</option>
          </select>
        </div>

        <div className="zen-list-field">
          <label htmlFor="ticket-sort-by">Sort By</label>
          <select
            id="ticket-sort-by"
            value={filters.sortBy}
            onChange={(event) => handleSelectChange("sortBy", event)}
          >
            {SORT_OPTIONS.map((option) => (
              <option value={option.value} key={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        <div className="zen-list-field">
          <label htmlFor="ticket-sort-order">Sort Direction</label>
          <select
            id="ticket-sort-order"
            value={filters.sortOrder}
            onChange={(event) => handleSelectChange("sortOrder", event)}
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>

        <button
          type="button"
          className="zen-button zen-button-secondary zen-clear-filters"
          onClick={clearFilters}
          disabled={!hasFilters}
        >
          Clear Filters
        </button>
      </section>

      {referenceError !== null && (
        <div className="zen-callout zen-callout-warning" role="alert">
          {referenceError}
          <button
            type="button"
            className="zen-button zen-button-secondary zen-small-button"
            onClick={() => setReferenceRetry((value) => value + 1)}
          >
            Retry
          </button>
        </div>
      )}

      {notice !== null && (
        <div className="zen-callout zen-callout-info" role="status">
          {notice}
        </div>
      )}

      {listState === "loading" && (
        <section className="zen-ticket-results" aria-busy="true" aria-live="polite">
          <div className="zen-status" role="status">
            <span className="zen-spinner" aria-hidden="true" />
            Loading My Tickets…
          </div>
          <div className="zen-ticket-skeleton" aria-hidden="true">
            <span /><span /><span /><span />
          </div>
        </section>
      )}

      {listState === "error" && (
        <section className="zen-callout zen-callout-error" role="alert">
          <p>{listError ?? "Unable to load My Tickets. Please try again."}</p>
          <button
            type="button"
            className="zen-button zen-button-secondary"
            onClick={() => setListRetry((value) => value + 1)}
          >
            Retry
          </button>
        </section>
      )}

      {listState === "success" && meta !== null && tickets.length === 0 && (
        <section className="zen-empty-panel" aria-live="polite">
          {meta.totalItems === 0 && !hasFilters ? (
            <>
              <h2>No Tickets yet</h2>
              <p>This Requester has not created any Tickets.</p>
              <button
                type="button"
                className="zen-button zen-button-primary"
                onClick={() => onNavigate?.("create-ticket")}
              >
                Create Ticket
              </button>
            </>
          ) : (
            <>
              <h2>No Tickets match your search</h2>
              <p>Try changing the search or filters.</p>
              <button
                type="button"
                className="zen-button zen-button-secondary"
                onClick={clearFilters}
              >
                Clear Filters
              </button>
            </>
          )}
        </section>
      )}

      {listState === "success" && meta !== null && tickets.length > 0 && (
        <section className="zen-ticket-results" aria-label="My Tickets results">
          <div className="zen-ticket-table-wrap">
            <table className="zen-ticket-table">
              <caption className="zen-visually-hidden">Tickets owned by {requesterName}</caption>
              <thead>
                <tr>
                  <th aria-sort={filters.sortBy === "ticketNumber" ? (filters.sortOrder === "asc" ? "ascending" : "descending") : "none"}>{sortHeader("ticketNumber", "Ticket Number")}</th>
                  <th>Summary</th>
                  <th aria-sort={filters.sortBy === "category" ? (filters.sortOrder === "asc" ? "ascending" : "descending") : "none"}>{sortHeader("category", "Category")}</th>
                  <th>Related System</th>
                  <th aria-sort={filters.sortBy === "requestedPriority" ? (filters.sortOrder === "asc" ? "ascending" : "descending") : "none"}>{sortHeader("requestedPriority", "Requested Priority")}</th>
                  <th aria-sort={filters.sortBy === "currentStatus" ? (filters.sortOrder === "asc" ? "ascending" : "descending") : "none"}>{sortHeader("currentStatus", "Current Status")}</th>
                  <th aria-sort={filters.sortBy === "updatedAt" ? (filters.sortOrder === "asc" ? "ascending" : "descending") : "none"}>{sortHeader("updatedAt", "Last Updated")}</th>
                  <th><span className="zen-visually-hidden">Ticket action</span></th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr key={ticket.id}>
                    <td><span className="zen-ticket-number">{ticket.ticketNumber}</span></td>
                    <td className="zen-ticket-summary">{ticket.summary}</td>
                    <td>{ticket.category.name}</td>
                    <td>{ticket.relatedSystem.name}</td>
                    <td><span className="zen-badge zen-badge-priority">{priorityLabel(ticket.requestedPriority)}</span></td>
                    <td><span className="zen-badge zen-badge-status">{statusLabel(ticket.currentStatus)}</span></td>
                    <td>{formatDate(ticket.updatedAt)}</td>
                    <td>
                      <button
                        type="button"
                        className="zen-button zen-button-secondary zen-small-button"
                        onClick={() => openTicket(ticket.id)}
                        aria-label={`Open ${ticket.ticketNumber}`}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="zen-ticket-card-list">
            {tickets.map(renderTicketCard)}
          </div>

          <div className="zen-pagination" aria-label="Ticket pagination">
            <p>{getPageSummary(meta)}</p>
            <div className="zen-pagination-controls">
              <button
                type="button"
                className="zen-button zen-button-secondary"
                disabled={!meta.hasPreviousPage}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </button>
              <span aria-live="polite">Page {meta.page} of {meta.totalPages}</span>
              <button
                type="button"
                className="zen-button zen-button-secondary"
                disabled={!meta.hasNextPage}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </button>
              <label htmlFor="ticket-page-size">Page size</label>
              <select
                id="ticket-page-size"
                value={pageSize}
                onChange={handlePageSizeChange}
              >
                {PAGE_SIZES.map((size) => <option value={size} key={size}>{size}</option>)}
              </select>
            </div>
          </div>
        </section>
      )}

      {listState === "success" && meta !== null && tickets.length > 0 && (
        <p className="zen-list-sort-note">
          Sorted by {SORT_OPTIONS.find((option) => option.value === filters.sortBy)?.label} ({sortDirectionLabel(filters.sortOrder)}).
        </p>
      )}
    </div>
  );
}
