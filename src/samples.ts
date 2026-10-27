// Sample import files, bundled into the app so they can be saved anywhere (including the Android app).
import roster from '../samples/demo-roster.csv?raw';
import timetable from '../samples/demo-timetable.csv?raw';
import icp from '../samples/icp-template.csv?raw';
import { saveFile } from './files';

const SAMPLES = { roster, timetable, icp };
const NAMES = { roster: 'sample-roster', timetable: 'sample-timetable', icp: 'icp-import-template' };

export function saveSample(which: keyof typeof SAMPLES) {
  return saveFile(new Blob(['﻿' + SAMPLES[which]], { type: 'text/csv;charset=utf-8' }), `solaristic-radar-${NAMES[which]}.csv`, 'sample');
}
