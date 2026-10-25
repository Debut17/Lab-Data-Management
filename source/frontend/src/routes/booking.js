router.delete('/bookings/:id', async (req, res) => {
  try {
    const booking = await bookingRepository.cancel(
      req.params.id,
      req.user.id,
    );

    res.status(200).json({
      booking,
    });
  } catch (error) {
    if (error.code === 'BOOKING_NOT_FOUND') {
      return res.status(404).json({
        message: error.message,
      });
    }

    if (error.code === 'BOOKING_FORBIDDEN') {
      return res.status(403).json({
        message: error.message,
      });
    }

    if (error.code === 'BOOKING_CANNOT_CANCEL') {
      return res.status(409).json({
        message: error.message,
      });
    }

    res.status(500).json({
      message: 'Failed to cancel booking.',
    });
  }
});