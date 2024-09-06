const { DateTime } = require('luxon'); 
const { setUserState, clearUserState } = require('../services/stateManager');
const { sendWhatsAppMessage, sendCancellationDatesList } = require('../middleware/whatsappMiddleware');
const { getDatesToDrop, dropDates } = require('../services/cancelService');

async function handleCancelAppointment(fromNumber) {
  console.log(`Entering handleCancelAppointment for ${fromNumber}`);
  try {
    const datesToDrop = await getDatesToDrop(fromNumber);
    console.log('Dates to drop:', JSON.stringify(datesToDrop, null, 2));

    if (datesToDrop.status === "error") {
      console.log(`Error status received for ${fromNumber}:`, datesToDrop.message);
      await sendWhatsAppMessage(fromNumber, datesToDrop.message);
      clearUserState(fromNumber);
      return;
    }

    if (!datesToDrop.booking_date || typeof datesToDrop.booking_date !== 'object') {
      console.error('Invalid datesToDrop format:', datesToDrop);
      await sendWhatsAppMessage(fromNumber, "Sorry, we couldn't retrieve your appointments. Please try again later.");
      clearUserState(fromNumber);
      return;
    }

    if (Object.keys(datesToDrop.booking_date).length === 0) {
      console.log(`No appointments to cancel for ${fromNumber}`);
      await sendWhatsAppMessage(fromNumber, "You don't have any appointments that can be cancelled at this time.");
      clearUserState(fromNumber);
      return;
    }

    console.log(`Sending dates to cancel for ${fromNumber}`);
    await sendDatesToCancel(fromNumber, datesToDrop);
    setUserState(fromNumber, 'awaitingCancellationConfirmation');
  } catch (error) {
    console.error('Error in handleCancelAppointment:', error);
    await sendWhatsAppMessage(fromNumber, "Sorry, we encountered an error while processing your cancellation request.");
    clearUserState(fromNumber);
  }
}

async function sendDatesToCancel(fromNumber, datesToDrop) {
  console.log(`Entering sendDatesToCancel for ${fromNumber}`);
  const rows = Object.entries(datesToDrop.booking_date).map(([id, dateTimeString]) => {
    console.log(`Processing date: ${dateTimeString}`);
    const [datePart, timePart] = dateTimeString.split(' ');
    const [year, month, day] = datePart.split('-');
    const [time, period] = timePart.split(' ');
    const [hour, minute] = time.split(':');
    
    const dateTime = DateTime.fromObject({
      year: parseInt(year),
      month: parseInt(month),
      day: parseInt(day),
      hour: period === 'PM' ? parseInt(hour) + 12 : parseInt(hour),
      minute: parseInt(minute)
    }, { zone: 'utc' });

    return {
      id: id.toString(),
      title: dateTime.toFormat('MMMM d, yyyy'),
      description: dateTime.toFormat('h:mm a')
    };
  });

  const listMessage = {
    title: 'Cancel Appointment',
    body: 'Please select the slot you want to Cancel',
    options: rows
  };

  console.log(`Sending cancellation list for ${fromNumber}:`, JSON.stringify(listMessage, null, 2));
  await sendCancellationDatesList(fromNumber, listMessage);
}




async function handleDropStatus(fromNumber, bookingDateId) {
  try {
    const dropStatus = await dropDates(fromNumber, bookingDateId);
    let message;
    if (dropStatus.status === "success" || dropStatus.status === "sucess") {
      message = `\n${dropStatus.message}\n`;
    } else {
      message = `\nError: ${dropStatus.message}\n`;
    }
    await sendWhatsAppMessage(fromNumber, message);
  } catch (error) {
    console.error('Error handling drop status:', error.message);
    await sendWhatsAppMessage(fromNumber, "\nUnexpected error occurred while cancelling the appointment. Please try again later or contact support.\n");
  } finally {
    clearUserState(fromNumber);
  }
}

module.exports = { handleCancelAppointment, handleDropStatus };