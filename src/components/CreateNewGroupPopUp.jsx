import React, { useContext } from 'react';
import Modal from 'react-modal';

/* CSS styles */
import '@/styles/NewTab.css';

/* Utilities */
import { constructValidURL } from "@/core/utils/Utilities";

/* Bookmark Storage */
import { useBookmarkManager } from '@/hooks/useBookmarkManager';

/* Constants */
import { URL_PATTERN } from '@/core/constants/Constants';


function CreateNewGroupPopUp(props) {
  // Get all actions from the custom bookmarks hook
  const { 
    addNamedBookmark, 
  } = useBookmarkManager();   

  const [modalIsOpen, setIsOpen] = React.useState(false);
  const [bookmarkName, setBookmarkName] = React.useState('')
  const [bookmarkUrl, setBookmarkUrl] = React.useState('')

  function handleBookmarkNameChange(event) {
    setBookmarkName(event.target.value);
  }

  function handleBookmarkUrlChange(event) {
    setBookmarkUrl(event.target.value);
  }

  const customStyles = {
    content: {
      width: '250px',
      height: '250px',
      backgroundColor: '#f5f5f5',
      border: '1px solid #a6a4a4',
      boxShadow: '0px 0px 5px 0px rgba(130, 128, 128, 0.75)',
      zIndex: '9999',
      borderRadius: '5px',
      padding: '10px',
    }
  };

  function openModal() {
    setIsOpen(true);
  }

  function afterOpenModal() {
    // Pass
  }

  function closeModal() {
    setIsOpen(false);
  }

  async function handleSubmit(event) {
    event.preventDefault(); // prevent the form from submitting normally
    addNamedBookmark(bookmarkName, constructValidURL(bookmarkUrl), props.groupName);
    
    setBookmarkName('');
    setBookmarkUrl('');
    event.target.reset();  
  }

  // We make the URL be of type text so we can validate its format on our own, and we don't require the user to put https:// in front
  return (
    <div> 
      <button className="add-bookmark-button" onClick={openModal}>
        + Add Link
      </button>
      <Modal
        isOpen={modalIsOpen}
        onAfterOpen={afterOpenModal}
        onRequestClose={closeModal}
        contentLabel="Add New Bookmark"
        style={customStyles}
      >
        <button className="close-popup-button" onClick={closeModal}>X</button>
        <form onSubmit={handleSubmit}>
          <label htmlFor="bookmark-name">Name</label>
          <input type="text" id="bookmark-name" value={bookmarkName} onChange={handleBookmarkNameChange} required />
          <label htmlFor="bookmark-url">URL</label>
          <input type="text" id="bookmark-url" value={bookmarkUrl} onChange={handleBookmarkUrlChange} pattern={URL_PATTERN} required></input>
          <button type="submit" className="add-bookmark-button">Add Bookmark</button>
        </form>
      </Modal>
    </div>
  );
}

export { CreateNewGroupPopUp };