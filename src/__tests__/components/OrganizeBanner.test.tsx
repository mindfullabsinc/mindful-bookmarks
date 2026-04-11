import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

import { OrganizeBanner } from '@/components/OrganizeBanner';

describe('OrganizeBanner', () => {
  test('renders an undo button while organizing and calls onUndo', () => {
    const onUndo = jest.fn();

    render(
      <OrganizeBanner
        visible={true}
        backendPhase="categorizing"
        succeeded={false}
        onUndo={onUndo}
      />
    );

    fireEvent.click(screen.getAllByRole('button', { name: /undo/i })[0]);
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  test('renders an undo button on the success card and calls onUndo', () => {
    const onUndo = jest.fn();

    render(
      <OrganizeBanner
        visible={true}
        backendPhase="done"
        succeeded={true}
        onUndo={onUndo}
      />
    );

    fireEvent.click(screen.getAllByRole('button', { name: /undo/i })[1]);
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});
