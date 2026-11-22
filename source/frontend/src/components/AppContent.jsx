import { useState } from 'react';

import AdminNotifications from './AdminNotifications.jsx';
import AdministrativeRecords from './AdministrativeRecords.jsx';
import AuditHistory from './AuditHistory.jsx';
import BookingForm from './BookingForm.jsx';
import BookingReview from './BookingReview.jsx';
import IssueReportReview from './IssueReportReview.jsx';
import LabResources from './LabResources.jsx';
import MyBookings from './MyBookings.jsx';
import MyResourceReports from './MyResourceReports.jsx';
import ResourceArchive from './ResourceArchive.jsx';
import ResourceAvailability from './ResourceAvailability.jsx';
import ResourceEditor from './ResourceEditor.jsx';
import ResourceForm from './ResourceForm.jsx';
import ResourceProblemForm from './ResourceProblemForm.jsx';
import RoleManagement from './RoleManagement.jsx';
import {
  archiveResource,
  cancelBooking,
  createBooking,
  createResource,
  createResourceReport,
  extractResourceFromPdf,
  getAdminRecordsSummary,
  getAdminResourceReports,
  getAuditLogs,
  getMyBookings,
  getMyResourceReports,
  getPendingBookings,
  getResourceReportNotifications,
  listAdminResources,
  listBookingRecords,
  listResources,
  listUsers,
  markResourceReportNotificationRead,
  resolveResourceReport,
  reviewBooking,
  updateResource,
  updateResourceAvailability,
  updateUserRole,
} from '../services/api.js';

export default function AppContent({ user, activeView, onOpenView }) {
  const [bookingRefreshKey, setBookingRefreshKey] = useState(0);
  const [reportRefreshKey, setReportRefreshKey] = useState(0);

  if (user.role === 'SYSTEM_ADMIN') {
    return (
      <AdministratorContent
        user={user}
        activeView={activeView}
        onOpenView={onOpenView}
      />
    );
  }

  if (user.role === 'LAB_STAFF') {
    return (
      <>
        <ResourceProblemForm
          key={user.id}
          onLoadResources={listResources}
          onCreate={async (report) => {
            const saved = await createResourceReport(report);
            setReportRefreshKey((key) => key + 1);
            return saved;
          }}
          reporterName={user.displayName}
        />
        <MyResourceReports
          key={`reports-${user.id}`}
          loadReports={getMyResourceReports}
          refreshKey={reportRefreshKey}
        />
      </>
    );
  }

  if (activeView === 'lab-resources') {
    return (
      <LabResources
        loadResources={listResources}
        onRequestBooking={() => onOpenView('resources')}
      />
    );
  }

  if (activeView === 'my-bookings') {
    return (
      <MyBookings
        onLoadBookings={getMyBookings}
        onCancel={cancelBooking}
        refreshKey={bookingRefreshKey}
      />
    );
  }

  return (
    <BookingForm
      onLoadResources={listResources}
      onCreate={createBooking}
      onCreated={() => setBookingRefreshKey((key) => key + 1)}
    />
  );
}

function AdministratorContent({ user, activeView, onOpenView }) {
  switch (activeView) {
    case 'problem-notifications':
      return (
        <AdminNotifications
          key={user.id}
          onLoadNotifications={getResourceReportNotifications}
          onMarkRead={markResourceReportNotificationRead}
        />
      );
    case 'issue-reports':
      return (
        <IssueReportReview
          loadReports={getAdminResourceReports}
          onResolve={resolveResourceReport}
        />
      );
    case 'edit':
      return <ResourceEditor loadResources={listAdminResources} onUpdate={updateResource} />;
    case 'availability':
      return (
        <ResourceAvailability
          loadResources={listAdminResources}
          onUpdateAvailability={updateResourceAvailability}
        />
      );
    case 'archive':
      return <ResourceArchive loadResources={listAdminResources} onArchive={archiveResource} />;
    case 'users':
      return (
        <RoleManagement
          currentUserId={user.id}
          loadUsers={listUsers}
          onUpdateRole={updateUserRole}
        />
      );
    case 'records':
      return (
        <AdministrativeRecords
          loadSummary={getAdminRecordsSummary}
          loadResources={listAdminResources}
          loadBookings={listBookingRecords}
          loadIssueReports={getAdminResourceReports}
          loadUsers={listUsers}
          loadAuditLogs={getAuditLogs}
          onOpenHistory={() => onOpenView('history')}
        />
      );
    case 'history':
      return <AuditHistory loadAuditLogs={getAuditLogs} />;
    case 'bookings':
      return <BookingReview loadBookings={getPendingBookings} onReview={reviewBooking} />;
    default:
      return <ResourceForm onCreate={createResource} onExtract={extractResourceFromPdf} />;
  }
}
