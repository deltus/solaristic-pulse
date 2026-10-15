// Sample import files, bundled into the app so they can be saved anywhere (including the Android app).
import roster from '../samples/demo-roster.csv?raw';
import timetable from '../samples/demo-timetable.csv?raw';
import { saveFile } from './files';

export function saveSample(which: 'roster' | 'timetable') {
  const text = which === 'roster' ? roster : timetable;
  return saveFile(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }), `solaristic-pulse-sample-${which}.csv`, 'sample');
}
